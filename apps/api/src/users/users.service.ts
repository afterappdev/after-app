import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { AccountLifecycleStatus, Prisma, Role } from '@prisma/client';
import {
  anonymizeVenueFinancialPii,
  listFinancialPurgeBlockers,
} from './account-purge.financial';
import { AccountPurgeAuditService } from './account-purge.audit';
import { UploadPurgeIncompleteError } from './account-purge.upload';
import { AuthUser } from '../common/decorators/current-user.decorator';
import * as bcrypt from 'bcrypt';
import { AppleAuthTokensService } from '../auth/apple-auth-tokens.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { LocationsService } from '../locations/locations.service';
import { resolveUserAgeBand } from './age-band';
import { AccountLifecycleService } from './account-lifecycle.service';

export type AdminPurgeStrategy = 'hard' | 'tombstone';

export type PurgeAccountOptions = {
  strategy?: AdminPurgeStrategy;
  auditSource?: 'admin' | 'scheduler';
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaCleanup: MediaCleanupService,
    private readonly appleTokens: AppleAuthTokensService,
    private readonly accountLifecycle: AccountLifecycleService,
    @Optional()
    private readonly purgeAudit?: AccountPurgeAuditService,
    @Optional()
    @Inject(LocationsService)
    private readonly locations?: LocationsService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        state: true,
        city: true,
        avatarUrl: true,
        ageBand: true,
        venue: { select: { id: true, name: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return {
      ...user,
      venueId: user.venue?.id ?? null,
    };
  }

  async updateMe(
    userId: string,
    data: {
      name?: string;
      city?: string;
      state?: string;
      avatarUrl?: string | null;
      ageBand?: string | null;
    },
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarUrl: true, city: true, state: true, role: true },
    });
    if (!current) {
      throw new NotFoundException('Usuário não encontrado');
    }

    let ibgeCityId: number | null | undefined;
    if (data.city !== undefined || data.state !== undefined) {
      const city = data.city ?? current.city;
      const state = data.state ?? current.state;
      ibgeCityId = this.locations
        ? await this.locations.resolveMunicipalityId(city, state)
        : null;
    }

    const ageBand =
      data.ageBand === undefined || current.role !== Role.USER
        ? undefined
        : resolveUserAgeBand(data.ageBand);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        city: data.city,
        state: data.state,
        avatarUrl:
          data.avatarUrl === undefined ? undefined : data.avatarUrl || null,
        ...(ibgeCityId !== undefined ? { ibgeCityId } : {}),
        ...(ageBand !== undefined ? { ageBand } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        state: true,
        city: true,
        avatarUrl: true,
        ageBand: true,
      },
    });

    if (data.avatarUrl !== undefined) {
      const nextAvatar = data.avatarUrl || null;
      if (current.avatarUrl && current.avatarUrl !== nextAvatar) {
        await this.mediaCleanup.deleteStoredUpload(current.avatarUrl);
      }
    }

    return updated;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Senha atual incorreta.');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException(
        'A senha deverá conter no mínimo 6 caracteres.',
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { ok: true };
  }

  async listBlockedVenues(user: AuthUser) {
    this.assertConsumerUser(user);
    const rows = await this.prisma.userVenueBlock.findMany({
      where: { userId: user.userId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coverUrl: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      venueId: row.venueId,
      createdAt: row.createdAt,
      venue: row.venue,
    }));
  }

  async blockVenue(user: AuthUser, venueId: string) {
    this.assertConsumerUser(user);
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerUserId: true },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId === user.userId) {
      throw new ForbiddenException(
        'Você não pode bloquear o próprio estabelecimento',
      );
    }

    const block = await this.prisma.userVenueBlock.upsert({
      where: { userId_venueId: { userId: user.userId, venueId } },
      create: { userId: user.userId, venueId },
      update: {},
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coverUrl: true,
            city: true,
            state: true,
          },
        },
      },
    });
    await this.prisma.favorite.deleteMany({
      where: { userId: user.userId, venueId },
    });
    return {
      id: block.id,
      venueId: block.venueId,
      createdAt: block.createdAt,
      venue: block.venue,
    };
  }

  async unblockVenue(user: AuthUser, venueId: string) {
    this.assertConsumerUser(user);
    await this.prisma.userVenueBlock.deleteMany({
      where: { userId: user.userId, venueId },
    });
    return { ok: true };
  }

  private assertConsumerUser(user: AuthUser) {
    if (user.role !== Role.USER) {
      throw new ForbiddenException(
        'Apenas contas de cliente podem bloquear estabelecimentos',
      );
    }
  }

  /** Owner-initiated deletion: 30-day grace period, no immediate purge. */
  async deleteAccount(userId: string) {
    return this.accountLifecycle.scheduleAccountDeletion(userId);
  }

  async requestAccountDeletion(userId: string) {
    return this.accountLifecycle.scheduleAccountDeletion(userId);
  }

  async cancelAccountDeletion(userId: string) {
    return this.accountLifecycle.cancelAccountDeletion(userId);
  }

  async getDeletionStatus(userId: string) {
    return this.accountLifecycle.getDeletionStatus(userId);
  }

  /**
   * Orchestrated permanent removal (admin). Respects financial blockers unless
   * strategy=tombstone. Scheduler uses the staged executor instead.
   */
  async purgeAccountPermanently(
    userId: string,
    options?: PurgeAccountOptions,
  ): Promise<{ ok: true; outcome: 'hard_deleted' | 'tombstoned' }> {
    const strategy = options?.strategy ?? 'hard';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        appleId: true,
        appleRefreshTokenEnc: true,
        appleClientId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (user.role === 'ADMIN') {
      throw new BadRequestException(
        'Conta administrativa não pode ser excluída por este fluxo.',
      );
    }

    const blockers = await this.listFinancialPurgeBlockersForUser(userId);
    if (blockers.length > 0 && strategy === 'hard') {
      throw new ConflictException({
        code: 'financial_blockers',
        reasons: blockers,
        hint:
          'Use query strategy=tombstone to anonymize while retaining financial records.',
      });
    }

    await this.anonymizeFinancialRetention(userId);
    this.purgeAudit?.log('data_anonymized', {
      userId,
      source: options?.auditSource ?? 'admin',
    });

    const subject = await this.loadUserForPermanentPurge(userId);
    if (!subject) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const urls = this.collectUploadUrlsFromUser(subject);

    await this.revokeOAuthBeforePermanentRemoval(userId);
    const outcome = await this.finalizePermanentUserRemoval(userId);

    const report = await this.mediaCleanup.deleteStoredUploadsWithReport(urls);
    if (report.failedUrls.length > 0) {
      this.purgeAudit?.log('uploads_partial_failure', {
        userId,
        failedCount: report.failedUrls.length,
        source: options?.auditSource ?? 'admin',
      });
      throw new UploadPurgeIncompleteError(report.failedUrls);
    }
    this.purgeAudit?.log('uploads_removed', {
      userId,
      removed: report.removed,
      source: options?.auditSource ?? 'admin',
    });

    this.purgeAudit?.log(
      outcome === 'hard_deleted' ? 'admin_purge_hard' : 'admin_purge_tombstone',
      { userId, strategy, blockerCount: blockers.length },
    );

    return { ok: true, outcome };
  }

  async deleteUserRecord(
    db: PrismaService | Prisma.TransactionClient,
    userId: string,
  ): Promise<Array<string | null | undefined>> {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        venue: {
          include: {
            photos: { select: { url: true } },
            banners: { select: { imageUrl: true } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (user.role === 'ADMIN') {
      throw new BadRequestException(
        'Conta administrativa não pode ser excluída por este fluxo.',
      );
    }

    const urls = this.collectUploadUrlsFromUser(user);

    await this.deleteRelatedOnboarding(db, {
      email: user.email,
      appleId: user.appleId,
      googleId: user.googleId,
    });
    // WelcomeCreditClaim has no foreign key, so the one-time welcome proof stays.
    await db.user.delete({ where: { id: userId } });
    return urls;
  }

  private async deleteRelatedOnboarding(
    db: PrismaService | Prisma.TransactionClient,
    user: { email: string; appleId: string | null; googleId: string | null },
  ) {
    const or: Prisma.SocialOnboardingTokenWhereInput[] = [
      { email: user.email },
    ];
    if (user.appleId) {
      or.push({ provider: 'apple', providerId: user.appleId });
    }
    if (user.googleId) {
      or.push({ provider: 'google', providerId: user.googleId });
    }
    await db.socialOnboardingToken.deleteMany({ where: { OR: or } });
  }

  collectUploadUrlsFromUser(user: {
    avatarUrl: string | null;
    venue?: {
      logoUrl: string | null;
      coverUrl: string | null;
      photos: Array<{ url: string }>;
      banners: Array<{ imageUrl: string | null }>;
    } | null;
  }): string[] {
    const urls: Array<string | null | undefined> = [user.avatarUrl];
    if (user.venue) {
      urls.push(user.venue.logoUrl, user.venue.coverUrl);
      urls.push(...user.venue.photos.map((photo) => photo.url));
      urls.push(...user.venue.banners.map((banner) => banner.imageUrl));
    }
    return urls.filter((url): url is string => !!url?.trim());
  }

  async loadUserForPermanentPurge(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        venue: {
          include: {
            photos: { select: { url: true } },
            banners: { select: { imageUrl: true } },
          },
        },
      },
    });
  }

  async listFinancialPurgeBlockersForUser(userId: string): Promise<string[]> {
    return listFinancialPurgeBlockers(this.prisma, userId);
  }

  async revokeOAuthBeforePermanentRemoval(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        appleId: true,
        appleRefreshTokenEnc: true,
        appleClientId: true,
      },
    });
    if (user) {
      await this.appleTokens.revokeForAccount(user);
    }
  }

  async anonymizeFinancialRetention(userId: string): Promise<void> {
    const venue = await this.prisma.venue.findUnique({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    if (venue) {
      await anonymizeVenueFinancialPii(this.prisma, venue.id);
    }
  }

  async tombstonePurgedAccount(userId: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accountStatus: true },
    });
    if (existing?.accountStatus === AccountLifecycleStatus.PURGED) {
      return;
    }
    const tombstoneEmail = `purged+${userId}@deleted.after.local`;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Conta excluída',
        email: tombstoneEmail,
        passwordHash: '',
        googleId: null,
        appleId: null,
        appleRefreshTokenEnc: null,
        appleClientId: null,
        avatarUrl: null,
        state: '',
        city: '',
        ageBand: null,
        ibgeCityId: null,
        promoNotificationsEnabled: false,
        accountStatus: AccountLifecycleStatus.PURGED,
        deletionRequestedAt: null,
        permanentDeletionAt: null,
        sessionInvalidatedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    const venue = await this.prisma.venue.findUnique({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    if (venue) {
      await this.prisma.venue.update({
        where: { id: venue.id },
        data: {
          name: 'Estabelecimento removido',
          description: null,
          logoUrl: null,
          coverUrl: null,
          documentType: null,
          documentDigits: null,
          contacts: Prisma.DbNull,
        },
      });
    }
  }

  /**
   * Hard delete when no financial Restrict blockers; otherwise tombstone only.
   */
  async finalizePermanentUserRemoval(
    userId: string,
  ): Promise<'hard_deleted' | 'tombstoned'> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        appleId: true,
        appleRefreshTokenEnc: true,
        appleClientId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (user.role === Role.ADMIN) {
      throw new BadRequestException(
        'Conta administrativa não pode ser excluída por este fluxo.',
      );
    }

    const blockers = await this.listFinancialPurgeBlockersForUser(userId);
    if (blockers.length > 0) {
      const identity = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, appleId: true, googleId: true },
      });
      if (identity) {
        await this.deleteRelatedOnboarding(this.prisma, identity);
      }
      await this.tombstonePurgedAccount(userId);
      return 'tombstoned';
    }

    await this.deleteUserRecord(this.prisma, userId);
    return 'hard_deleted';
  }
}
