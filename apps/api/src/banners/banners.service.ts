import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PromoContentKind } from '../promo-push/promo-push.copy';
import {
  NoopPromoPushPublisher,
  PROMO_PUSH_PUBLISHER,
  type PromoPushPublisher,
} from '../promo-push/promo-push.publisher';
import { assertUserAccountActive } from '../common/account/account-eligibility';
import {
  type BannerWithSchedules,
  claimBannerPublicationIdempotency,
  completeBannerPublicationIdempotency,
  hashBannerCreateRequest,
  normalizeBannerIdempotencyKey,
} from './banner-create-idempotency';
import { quotePublication } from './banner-quote';
import {
  normalizeVipPublicationInput,
  VipPublicationPlan,
} from '../promo-push/vip-push-timing';
import { loadOwnedVenueContext } from '../venues/venue-context';

@Injectable()
export class BannersService {
  private readonly logger = new Logger(BannersService.name);
  private readonly promoPush: PromoPushPublisher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @Optional()
    @Inject(PROMO_PUSH_PUBLISHER)
    promoPush?: PromoPushPublisher,
  ) {
    this.promoPush = promoPush ?? new NoopPromoPushPublisher();
  }

  async history(userId: string, activeVenueId?: string) {
    const venue = await this.requireVenueOwned(userId, activeVenueId);
    return this.prisma.banner.findMany({
      where: { venueId: venue.id },
      include: { schedules: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Read-only price. A VIP day costs one VIP credit and no common credit. */
  pricing() {
    return {
      creditPerDisplayDay: this.creditPerDisplayDay(),
      vipCreditPerDisplayDay: 1,
      commonCreditsPerVipDay: 0,
    };
  }

  /**
   * Soft-cancels a banner owned by the authenticated venue.
   * Credits already spent stay spent. The row is kept for audit.
   */
  async cancel(userId: string, bannerId: string) {
    const banner = await this.prisma.banner.findFirst({
      where: { id: bannerId, venue: { ownerUserId: userId } },
      include: { schedules: true },
    });
    if (!banner) {
      throw new NotFoundException('Promo��o n�o encontrada');
    }
    if (banner.status === 'CANCELLED') {
      return banner;
    }

    const updated = await this.prisma.banner.update({
      where: { id: banner.id },
      data: { status: 'CANCELLED' },
      include: { schedules: true },
    });
    try {
      await this.promoPush.skipBanner(updated.id);
    } catch {
      // A failed skip does not restore the banner. The worker checks status.
    }
    return updated;
  }

  /**
   * Creates a banner for common and VIP civil dates.
   * Omitted VIP dates keep the legacy common-only debit.
   */
  async create(
    userId: string,
    imageUrl: string,
    dates: string[],
    title?: string,
    description?: string,
    contentKind?: PromoContentKind,
    vipDates: string[] = [],
    activeVenueId?: string,
    idempotencyKeyRaw?: string,
    vipPublications?: VipPublicationPlan[],
  ) {
    const now = new Date();
    const vipInput = normalizeVipPublicationInput(
      vipDates,
      vipPublications,
      now,
    );
    const quote = quotePublication({
      dates,
      vipDates: vipInput.vipDates,
      creditPerDisplayDay: this.creditPerDisplayDay(),
    });
    const timingByDate = new Map(
      vipInput.plans.map((plan) => [plan.date, plan.pushTiming]),
    );
    const venue = await this.requireVenueOwned(userId, activeVenueId);

    let resolvedIbge: number | null = null;
    try {
      resolvedIbge = await this.promoPush.resolveVenueCity(
        venue.city,
        venue.state,
      );
    } catch {
      resolvedIbge = null;
    }
    // A failed lookup must not invent a municipality. It also must not erase
    // an id already confirmed on the venue: an IBGE outage returns null too.
    const ibgeCityId = resolvedIbge ?? venue.ibgeCityId ?? null;

    if (quote.vipCredits > 0 && ibgeCityId == null) {
      throw new BadRequestException(
        'Publicação VIP exige município (IBGE) do estabelecimento para avisos na cidade. ' +
          'Confira cidade e UF do cadastro ou tente novamente mais tarde.',
      );
    }

    const idempotencyKey = normalizeBannerIdempotencyKey(idempotencyKeyRaw);
    const requestHash = idempotencyKey
      ? hashBannerCreateRequest({
          imageUrl,
          dates,
          vipDates: vipInput.vipDates,
          vipPublications: vipInput.plans,
          title,
          description,
          contentKind,
        })
      : undefined;

    let runSideEffects = true;
    const banner = await this.prisma.$transaction<BannerWithSchedules>(async (tx) => {
      if (idempotencyKey && requestHash) {
        const claim = await claimBannerPublicationIdempotency(tx, {
          venueId: venue.id,
          idempotencyKey,
          requestHash,
        });
        if (claim.kind === 'replay') {
          runSideEffects = false;
          return claim.banner;
        }
      }

      const wallet = await tx.creditWallet.findUnique({
        where: { venueId: venue.id },
      });
      assertBalances(wallet, quote.commonCredits, quote.vipCredits);

      const updated = await tx.creditWallet.updateMany({
        where: {
          venueId: venue.id,
          ...(quote.commonCredits > 0
            ? { balance: { gte: quote.commonCredits } }
            : {}),
          ...(quote.vipCredits > 0
            ? { vipBalance: { gte: quote.vipCredits } }
            : {}),
        },
        data: {
          ...(quote.commonCredits > 0
            ? { balance: { decrement: quote.commonCredits } }
            : {}),
          ...(quote.vipCredits > 0
            ? { vipBalance: { decrement: quote.vipCredits } }
            : {}),
        },
      });
      if (updated.count === 0) {
        const latest = await tx.creditWallet.findUnique({
          where: { venueId: venue.id },
        });
        assertBalances(latest, quote.commonCredits, quote.vipCredits);
        throw new BadRequestException('Saldo de créditos insuficiente');
      }

      if (resolvedIbge != null && resolvedIbge !== venue.ibgeCityId) {
        await tx.venue.update({
          where: { id: venue.id },
          data: { ibgeCityId: resolvedIbge },
        });
      }

      const created = await tx.banner.create({
        data: {
          venueId: venue.id,
          imageUrl,
          title: title?.trim() || null,
          description: description?.trim() || null,
          creditsCost: quote.commonCredits,
          vipCreditsCost: quote.vipCredits,
          status: 'ACTIVE',
          contentKind: contentKind ?? null,
          schedules: {
            create: quote.days.map((day) => ({
              displayDate: parseDateOnly(day.date),
              citySnapshot: venue.city,
              ibgeCityId,
              tier: day.tier,
              vipPushTiming:
                day.tier === 'VIP'
                  ? (timingByDate.get(day.date) ?? null)
                  : null,
            })),
          },
        },
        include: { schedules: true },
      });
      for (const schedule of created.schedules) {
        if (schedule.tier !== 'VIP') continue;
        const entry = await tx.vipCreditEntry.create({
          data: {
            venueId: venue.id,
            operationKey: `vip-consume:${schedule.id}`,
            kind: 'consume',
            credits: 1,
            balanceDelta: -1,
            bannerId: created.id,
            scheduleId: schedule.id,
          },
        });
        await tx.bannerSchedule.update({
          where: { id: schedule.id },
          data: { vipCreditEntryId: entry.id },
        });
        schedule.vipCreditEntryId = entry.id;
      }
      if (idempotencyKey) {
        await completeBannerPublicationIdempotency(tx, {
          venueId: venue.id,
          idempotencyKey,
          bannerId: created.id,
        });
      }
      return created;
    });

    // The credit debit and the banner are already committed. An outbox failure
    // must not refund or hide the publication. The insert is idempotent on
    // bannerScheduleId, so a later retry cannot duplicate the event or the debit.
    const schedules = banner.schedules.map((schedule, index) => {
      const dayLabel = formatScheduleDate(schedule.displayDate);
      const tier = schedule.tier ?? quote.days[index]?.tier ?? 'COMMON';
      return {
        id: schedule.id,
        displayDate: schedule.displayDate,
        ibgeCityId: schedule.ibgeCityId,
        tier,
        vipCreditEntryId: schedule.vipCreditEntryId ?? null,
        pushTiming:
          tier === 'VIP'
            ? (schedule.vipPushTiming ??
              timingByDate.get(dayLabel) ??
              null)
            : null,
      };
    });
    if (runSideEffects) {
      try {
        await this.promoPush.recordSchedules(this.prisma, {
          bannerId: banner.id,
          venueId: venue.id,
          contentKind: contentKind ?? null,
          now,
          schedules,
        });
      } catch {
        try {
          await this.promoPush.recordSchedules(this.prisma, {
            bannerId: banner.id,
            venueId: venue.id,
            contentKind: contentKind ?? null,
            now,
            schedules,
          });
        } catch {
          this.logger.error(`promo-push outbox failed banner=${banner.id}`);
        }
      }

      try {
        await this.notifications.notifyFavoriteFollowers({
          venueId: venue.id,
          venueName: venue.name,
          bannerId: banner.id,
          promoTitle: title,
        });
      } catch {
        // Publishing still succeeds if inbox fan-out fails.
      }
    }

    return banner;
  }

  private creditPerDisplayDay() {
    const perDay = Number(this.config.get('CREDIT_PER_DISPLAY_DAY') ?? 1);
    return Number.isFinite(perDay) && perDay > 0 ? perDay : 1;
  }

  private async requireVenueOwned(userId: string, requestedVenueId?: string) {
    await assertUserAccountActive(this.prisma, userId);
    return loadOwnedVenueContext(this.prisma, userId, requestedVenueId);
  }
}

function assertBalances(
  wallet: { balance: number; vipBalance?: number | null } | null,
  commonCredits: number,
  vipCredits: number,
) {
  const commonShort =
    commonCredits > 0 && (!wallet || wallet.balance < commonCredits);
  const vipShort =
    vipCredits > 0 && (!wallet || (wallet.vipBalance ?? 0) < vipCredits);
  if (commonShort) {
    throw new BadRequestException('Saldo de créditos insuficiente');
  }
  if (vipShort) {
    throw new BadRequestException('Saldo de créditos VIP insuficiente');
  }
}

/** Parses YYYY-MM-DD as a UTC date-only value for Prisma @db.Date. */
function formatScheduleDate(value: Date): string {
  const y = value.getUTCFullYear();
  const m = (value.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = value.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) {
    throw new BadRequestException(`Data inválida: ${value}`);
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
