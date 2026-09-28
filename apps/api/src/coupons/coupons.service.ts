import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { isCouponCode, normalizeCouponCode } from './coupon-code';

export type CouponWriteInput = {
  code?: string;
  creditAmount?: number;
  active?: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  maxRedemptionsPerVenue?: number;
};

export type CouponCreateInput = CouponWriteInput & {
  code: string;
  creditAmount: number;
};

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(page: number, limit: number, skip: number) {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.creditCoupon.count(),
      this.prisma.creditCoupon.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { redemptions: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => this.toSummary(row)),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async getById(id: string) {
    const coupon = await this.prisma.creditCoupon.findUnique({
      where: { id },
      include: {
        _count: { select: { redemptions: true } },
        redemptions: {
          orderBy: { redeemedAt: 'desc' },
          take: 100,
          include: { venue: { select: { id: true, name: true, city: true } } },
        },
      },
    });
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }
    return {
      ...this.toSummary(coupon),
      redemptions: coupon.redemptions.map((row) => ({
        id: row.id,
        venueId: row.venueId,
        venueName: row.venue?.name ?? row.venueNameSnapshot,
        city: row.venue?.city ?? row.venueCitySnapshot,
        creditAmount: row.creditAmount,
        redeemedAt: row.redeemedAt,
      })),
    };
  }

  async create(admin: AuthUser, input: CouponCreateInput) {
    const code = this.requireCode(input.code);
    const creditAmount = this.requireCredits(input.creditAmount);
    const startsAt = this.parseOptionalDate(input.startsAt, 'início');
    const expiresAt = this.parseOptionalDate(input.expiresAt, 'validade');
    this.assertWindow(startsAt, expiresAt);
    const maxRedemptions = this.parseOptionalLimit(input.maxRedemptions);
    const maxRedemptionsPerVenue = input.maxRedemptionsPerVenue ?? 1;
    this.assertLimit(maxRedemptionsPerVenue, 'limite por estabelecimento');

    try {
      const created = await this.prisma.creditCoupon.create({
        data: {
          code,
          creditAmount,
          active: input.active ?? true,
          startsAt,
          expiresAt,
          maxRedemptions,
          maxRedemptionsPerVenue,
          createdById: admin.userId,
        },
        include: { _count: { select: { redemptions: true } } },
      });
      return this.toSummary(created);
    } catch (err) {
      this.rethrowUnique(err);
      throw err;
    }
  }

  async update(id: string, input: CouponWriteInput) {
    const current = await this.prisma.creditCoupon.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!current) {
      throw new NotFoundException('Cupom não encontrado');
    }

    const data: Prisma.CreditCouponUpdateInput = {};
    if (input.code !== undefined) {
      const code = this.requireCode(input.code);
      if (code !== current.code && current._count.redemptions > 0) {
        throw new BadRequestException(
          'Não é possível alterar o código de um cupom que já foi utilizado.',
        );
      }
      data.code = code;
    }
    if (input.creditAmount !== undefined) {
      const creditAmount = this.requireCredits(input.creditAmount);
      if (
        creditAmount !== current.creditAmount &&
        current._count.redemptions > 0
      ) {
        throw new BadRequestException(
          'Não é possível alterar os créditos de um cupom que já foi utilizado.',
        );
      }
      data.creditAmount = creditAmount;
    }
    if (input.active !== undefined) data.active = input.active;

    const startsAt =
      input.startsAt === undefined
        ? current.startsAt
        : this.parseOptionalDate(input.startsAt, 'início');
    const expiresAt =
      input.expiresAt === undefined
        ? current.expiresAt
        : this.parseOptionalDate(input.expiresAt, 'validade');
    if (input.startsAt !== undefined) data.startsAt = startsAt;
    if (input.expiresAt !== undefined) data.expiresAt = expiresAt;
    this.assertWindow(startsAt, expiresAt);

    if (input.maxRedemptions !== undefined) {
      const maxRedemptions = this.parseOptionalLimit(input.maxRedemptions);
      if (
        maxRedemptions != null &&
        maxRedemptions < current._count.redemptions
      ) {
        throw new BadRequestException(
          'O limite total não pode ser menor que a quantidade já utilizada.',
        );
      }
      data.maxRedemptions = maxRedemptions;
    }
    if (input.maxRedemptionsPerVenue !== undefined) {
      this.assertLimit(
        input.maxRedemptionsPerVenue,
        'limite por estabelecimento',
      );
      data.maxRedemptionsPerVenue = input.maxRedemptionsPerVenue;
    }

    try {
      const updated = await this.prisma.creditCoupon.update({
        where: { id },
        data,
        include: { _count: { select: { redemptions: true } } },
      });
      return this.toSummary(updated);
    } catch (err) {
      this.rethrowUnique(err);
      throw err;
    }
  }

  /**
   * Redeems a coupon for the authenticated venue.
   * The client sends only the code. Credits, limits and dates come from the row
   * locked with SELECT ... FOR UPDATE inside the same transaction as the
   * redemption insert and the wallet increment.
   */
  async redeem(user: AuthUser, rawCode: string) {
    if (user.role !== 'VENUE') {
      throw new ForbiddenException(
        'Cupom disponível apenas para estabelecimentos.',
      );
    }
    if (!isCouponCode(rawCode ?? '')) {
      throw new BadRequestException('Informe um código de cupom válido.');
    }
    const code = normalizeCouponCode(rawCode);

    const venue = await this.prisma.venue.findUnique({
      where: { ownerUserId: user.userId },
      select: { id: true, name: true, city: true },
    });
    if (!venue) {
      throw new ForbiddenException('Conta não é de estabelecimento');
    }

    return this.prisma.$transaction(async (tx) => {
      const located = await tx.creditCoupon.findUnique({ where: { code } });
      if (!located) {
        throw new NotFoundException('Cupom inexistente.');
      }

      await tx.$queryRaw`SELECT "id" FROM "CreditCoupon" WHERE "id" = ${located.id} FOR UPDATE`;

      const coupon = await tx.creditCoupon.findUnique({
        where: { id: located.id },
      });
      if (!coupon) {
        throw new NotFoundException('Cupom inexistente.');
      }

      const now = new Date();
      if (!coupon.active) {
        throw new BadRequestException('Este cupom está inativo.');
      }
      if (coupon.startsAt && coupon.startsAt > now) {
        throw new BadRequestException('Este cupom ainda não está disponível.');
      }
      if (coupon.expiresAt && coupon.expiresAt <= now) {
        throw new BadRequestException('Este cupom expirou.');
      }

      const total = await tx.creditCouponRedemption.count({
        where: { couponId: coupon.id },
      });
      if (coupon.maxRedemptions != null && total >= coupon.maxRedemptions) {
        throw new BadRequestException(
          'Este cupom atingiu o limite de utilizações.',
        );
      }

      const perVenue = await tx.creditCouponRedemption.count({
        where: { couponId: coupon.id, venueId: venue.id },
      });
      if (perVenue >= coupon.maxRedemptionsPerVenue) {
        throw new BadRequestException(
          'Este cupom já foi utilizado por este estabelecimento.',
        );
      }

      await tx.creditCouponRedemption.create({
        data: {
          couponId: coupon.id,
          venueId: venue.id,
          venueNameSnapshot: venue.name,
          venueCitySnapshot: venue.city,
          creditAmount: coupon.creditAmount,
        },
      });

      const wallet = await tx.creditWallet.upsert({
        where: { venueId: venue.id },
        create: { venueId: venue.id, balance: coupon.creditAmount },
        update: { balance: { increment: coupon.creditAmount } },
      });

      return {
        code: coupon.code,
        creditAmount: coupon.creditAmount,
        balance: wallet.balance,
      };
    });
  }

  private toSummary(row: {
    id: string;
    code: string;
    creditAmount: number;
    active: boolean;
    startsAt: Date | null;
    expiresAt: Date | null;
    maxRedemptions: number | null;
    maxRedemptionsPerVenue: number;
    createdAt: Date;
    updatedAt: Date;
    _count: { redemptions: number };
  }) {
    return {
      id: row.id,
      code: row.code,
      creditAmount: row.creditAmount,
      active: row.active,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      maxRedemptions: row.maxRedemptions,
      maxRedemptionsPerVenue: row.maxRedemptionsPerVenue,
      redemptionCount: row._count.redemptions,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private requireCode(raw: string | undefined): string {
    if (!raw || !isCouponCode(raw)) {
      throw new BadRequestException('Informe um código de cupom válido.');
    }
    return normalizeCouponCode(raw);
  }

  private requireCredits(value: number | undefined): number {
    if (value == null || !Number.isInteger(value) || value <= 0) {
      throw new BadRequestException('A quantidade de créditos deve ser maior que zero.');
    }
    return value;
  }

  private assertLimit(value: number, label: string) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`O ${label} deve ser maior que zero.`);
    }
  }

  private parseOptionalLimit(value: number | null | undefined): number | null {
    if (value == null) return null;
    this.assertLimit(value, 'limite total');
    return value;
  }

  private parseOptionalDate(
    value: string | null | undefined,
    label: string,
  ): Date | null {
    if (value == null || value === '') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Data de ${label} inválida.`);
    }
    return parsed;
  }

  private assertWindow(startsAt: Date | null, expiresAt: Date | null) {
    if (startsAt && expiresAt && expiresAt <= startsAt) {
      throw new BadRequestException(
        'A validade deve ser posterior ao início.',
      );
    }
  }

  private rethrowUnique(err: unknown): void {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('Já existe um cupom com esse código.');
    }
  }
}
