import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { monthlySalesHistory, realSaleWhere } from '../finance';
import { toMoneyNumber } from '../money';
import { paginate, paginationMeta } from '../pagination';
import { inclusiveDateRangeUtc } from '../timezone';
import {
  AdminSalesMonthlyQueryDto,
  AdminSalesQueryDto,
} from './admin-sales.query';

const SALE_SELECT = {
  id: true,
  packageKey: true,
  credits: true,
  amountPaid: true,
  currency: true,
  provider: true,
  status: true,
  confirmedAt: true,
  createdAt: true,
  venueId: true,
  venue: {
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
    },
  },
} satisfies Prisma.CreditPurchaseSelect;

@Injectable()
export class AdminSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminSalesQueryDto) {
    const { page, limit, skip } = paginate(query.page, query.limit);
    const where = this.buildWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.creditPurchase.count({ where }),
      this.prisma.creditPurchase.findMany({
        where,
        orderBy: { confirmedAt: 'desc' },
        skip,
        take: limit,
        select: SALE_SELECT,
      }),
    ]);

    return {
      items: rows.map((row) => this.toSaleListItem(row)),
      ...paginationMeta(page, limit, total),
    };
  }

  async monthly(query: AdminSalesMonthlyQueryDto, now = new Date()) {
    const months = query.months ?? 12;
    return {
      months,
      timeZone: 'America/Sao_Paulo',
      items: await monthlySalesHistory(this.prisma, months, now),
    };
  }

  async getById(id: string) {
    const sale = await this.prisma.creditPurchase.findFirst({
      where: { id, ...realSaleWhere },
      select: SALE_SELECT,
    });
    if (!sale) {
      throw new NotFoundException('Venda não encontrada');
    }
    return this.toSaleDetail(sale);
  }

  private buildWhere(
    query: AdminSalesQueryDto,
  ): Prisma.CreditPurchaseWhereInput {
    let range: { start?: Date; end?: Date };
    try {
      range = inclusiveDateRangeUtc(query.from, query.to);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Intervalo de datas inválido.',
      );
    }

    const confirmedAt: Prisma.DateTimeNullableFilter = { not: null };
    if (range.start) confirmedAt.gte = range.start;
    if (range.end) confirmedAt.lt = range.end;

    return {
      ...realSaleWhere,
      confirmedAt,
      ...(query.provider ? { provider: query.provider } : {}),
    };
  }

  private toSaleListItem(
    sale: Prisma.CreditPurchaseGetPayload<{ select: typeof SALE_SELECT }>,
  ) {
    return {
      id: sale.id,
      packageKey: sale.packageKey,
      credits: sale.credits,
      amountPaid: toMoneyNumber(sale.amountPaid),
      currency: sale.currency,
      provider: sale.provider,
      status: sale.status,
      confirmedAt: sale.confirmedAt,
      venueId: sale.venueId,
      venueName: sale.venue.name,
    };
  }

  private toSaleDetail(
    sale: Prisma.CreditPurchaseGetPayload<{ select: typeof SALE_SELECT }>,
  ) {
    return {
      ...this.toSaleListItem(sale),
      createdAt: sale.createdAt,
      venue: {
        id: sale.venue.id,
        name: sale.venue.name,
        city: sale.venue.city,
        state: sale.venue.state,
      },
    };
  }
}
