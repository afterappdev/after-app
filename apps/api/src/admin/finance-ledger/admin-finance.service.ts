import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  AdminFinanceCategory,
  AdminFinanceDirection,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { realSaleWhere } from '../finance';
import { toMoneyNumber } from '../money';
import { paginate, paginationMeta } from '../pagination';
import { monthRangeUtc, parseYearMonthParam } from '../timezone';
import { AdminFinanceCreateDto, AdminFinanceQueryDto } from './admin-finance.dto';

export type FinanceMovementRow = {
  id: string;
  direction: AdminFinanceDirection;
  description: string;
  amountBrl: number;
  category: AdminFinanceCategory;
  occurredAt: string;
  actorLabel: string;
  source: 'SALE' | 'MANUAL';
  notes?: string | null;
};

type DirectionTotals = {
  totalBrl: number;
  count: number;
};

@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(yearMonth: string) {
    const { start, end } = this.monthRange(yearMonth);
    const month = await this.totalsBetween(start, end);
    const accumulated = await this.totalsBetween(new Date(0), end);
    const daily = await this.dailyBetween(start, end);
    return {
      yearMonth,
      month,
      accumulatedBalanceBrl: accumulated.inflow.totalBrl - accumulated.outflow.totalBrl,
      monthBalanceBrl: month.inflow.totalBrl - month.outflow.totalBrl,
      accumulatedThrough: end.toISOString(),
      daily,
    };
  }

  async list(query: AdminFinanceQueryDto) {
    const { page, limit, skip } = paginate(query.page, query.limit);
    const { start, end } = this.monthRange(query.yearMonth);
    const merged = await this.mergeMovements(start, end);
    const total = merged.length;
    const slice = merged.slice(skip, skip + limit);
    return {
      items: slice,
      ...paginationMeta(page, limit, total),
    };
  }

  async create(adminId: string, dto: AdminFinanceCreateDto) {
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Data da movimentação inválida.');
    }
    const row = await this.prisma.adminFinanceEntry.create({
      data: {
        direction: dto.direction,
        description: dto.description.trim(),
        amountBrl: new Prisma.Decimal(dto.amountBrl.toFixed(2)),
        category: dto.category,
        occurredAt,
        notes: dto.notes?.trim() || null,
        createdById: adminId,
      },
      include: {
        createdBy: { select: { name: true } },
      },
    });
    return this.serializeManual(row);
  }

  private monthRange(yearMonth: string) {
    const ym = parseYearMonthParam(yearMonth);
    return monthRangeUtc(ym);
  }

  private async mergeMovements(start: Date, end: Date): Promise<FinanceMovementRow[]> {
    const [sales, manual] = await this.prisma.$transaction([
      this.prisma.creditPurchase.findMany({
        where: {
          ...realSaleWhere,
          confirmedAt: { gte: start, lt: end },
        },
        orderBy: { confirmedAt: 'desc' },
        select: {
          id: true,
          amountPaid: true,
          provider: true,
          confirmedAt: true,
        },
      }),
      this.prisma.adminFinanceEntry.findMany({
        where: { occurredAt: { gte: start, lt: end } },
        orderBy: { occurredAt: 'desc' },
        include: { createdBy: { select: { name: true } } },
      }),
    ]);

    const rows: FinanceMovementRow[] = [
      ...sales.map((sale) => this.serializeSale(sale)),
      ...manual.map((entry) => this.serializeManual(entry)),
    ];
    rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return rows;
  }

  private async totalsBetween(start: Date, end: Date) {
    const [saleAgg, manualIn, manualOut] = await this.prisma.$transaction([
      this.prisma.creditPurchase.aggregate({
        where: {
          ...realSaleWhere,
          confirmedAt: { gte: start, lt: end },
        },
        _sum: { amountPaid: true },
        _count: { _all: true },
      }),
      this.prisma.adminFinanceEntry.aggregate({
        where: {
          direction: AdminFinanceDirection.INFLOW,
          occurredAt: { gte: start, lt: end },
        },
        _sum: { amountBrl: true },
        _count: { _all: true },
      }),
      this.prisma.adminFinanceEntry.aggregate({
        where: {
          direction: AdminFinanceDirection.OUTFLOW,
          occurredAt: { gte: start, lt: end },
        },
        _sum: { amountBrl: true },
        _count: { _all: true },
      }),
    ]);

    const salesBrl = toMoneyNumber(saleAgg._sum.amountPaid ?? 0);
    const manualInBrl = toMoneyNumber(manualIn._sum.amountBrl ?? 0);
    const manualOutBrl = toMoneyNumber(manualOut._sum.amountBrl ?? 0);

    const inflow: DirectionTotals = {
      totalBrl: salesBrl + manualInBrl,
      count: saleAgg._count._all + manualIn._count._all,
    };
    const outflow: DirectionTotals = {
      totalBrl: manualOutBrl,
      count: manualOut._count._all,
    };
    return { inflow, outflow };
  }

  private async dailyBetween(start: Date, end: Date) {
    const merged = await this.mergeMovements(start, end);
    const byDay = new Map<string, { inflowBrl: number; outflowBrl: number }>();
    for (const row of merged) {
      const day = row.occurredAt.slice(0, 10);
      const bucket = byDay.get(day) ?? { inflowBrl: 0, outflowBrl: 0 };
      if (row.direction === AdminFinanceDirection.INFLOW) {
        bucket.inflowBrl += row.amountBrl;
      } else {
        bucket.outflowBrl += row.amountBrl;
      }
      byDay.set(day, bucket);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, values]) => ({
        date,
        inflowBrl: Number(values.inflowBrl.toFixed(2)),
        outflowBrl: Number(values.outflowBrl.toFixed(2)),
      }));
  }

  private serializeSale(sale: {
    id: string;
    amountPaid: Prisma.Decimal;
    provider: string | null;
    confirmedAt: Date | null;
  }): FinanceMovementRow {
    return {
      id: `sale:${sale.id}`,
      direction: AdminFinanceDirection.INFLOW,
      description: `Venda de créditos (${providerSaleLabel(sale.provider)})`,
      amountBrl: toMoneyNumber(sale.amountPaid),
      category: AdminFinanceCategory.VENDAS,
      occurredAt: sale.confirmedAt?.toISOString() ?? new Date().toISOString(),
      actorLabel: 'Sistema',
      source: 'SALE',
    };
  }

  private serializeManual(entry: {
    id: string;
    direction: AdminFinanceDirection;
    description: string;
    amountBrl: Prisma.Decimal;
    category: AdminFinanceCategory;
    occurredAt: Date;
    notes: string | null;
    createdBy: { name: string } | null;
  }): FinanceMovementRow {
    return {
      id: entry.id,
      direction: entry.direction,
      description: entry.description,
      amountBrl: toMoneyNumber(entry.amountBrl),
      category: entry.category,
      occurredAt: entry.occurredAt.toISOString(),
      actorLabel: entry.createdBy?.name?.trim() || 'Admin',
      source: 'MANUAL',
      notes: entry.notes,
    };
  }
}

function providerSaleLabel(provider: string | null | undefined): string {
  switch ((provider ?? '').toLowerCase()) {
    case 'pix':
      return 'PIX';
    case 'card':
      return 'Cartão de crédito';
    case 'app_store':
      return 'App Store';
    case 'google_play':
      return 'Google Play';
    default:
      return provider?.trim() || '—';
  }
}
