import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paidSalesSummaryInRange } from '../aggregates';
import { monthlySalesHistory, saleHistoryWhere } from '../finance';
import { toMoneyNumber } from '../money';
import { paginate, paginationMeta } from '../pagination';
import {
  inclusiveDateRangeUtc,
  monthRangeUtc,
  parseYearMonthParam,
} from '../timezone';
import {
  AdminSalesMonthlyQueryDto,
  AdminSalesQueryDto,
} from './admin-sales.query';
import { AdminSalesSummaryQueryDto } from './admin-sales.summary.query';

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
// Fiscal document fields are intentionally omitted from admin list/detail.

type RefundAudit = {
  kind: string;
  recordedAt: string;
  refundedAmount?: number;
  creditsRecovered?: number;
  creditsUnrecovered?: number;
  refundId?: string;
};

type AuditQueryRow = {
  purchaseId: string;
  kind: string;
  creditsRecovered: number | null;
  creditsUnrecovered: number | null;
  refundedAmount: unknown;
  refundId: string | null;
  createdAt: Date | string;
};

@Injectable()
export class AdminSalesService {
  private readonly logger = new Logger(AdminSalesService.name);

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

    const audits = await this.auditsFor(
      rows.map((row) => row.id),
    );
    return {
      items: rows.map((row) => this.toSaleListItem(row, audits.get(row.id) ?? [])),
      ...paginationMeta(page, limit, total),
    };
  }

  async summary(query: AdminSalesSummaryQueryDto) {
    let start: Date;
    let end: Date;
    let yearMonth: string | undefined;
    let from: string | undefined;
    let to: string | undefined;

    if (query.yearMonth) {
      yearMonth = query.yearMonth;
      const ym = parseYearMonthParam(query.yearMonth);
      ({ start, end } = monthRangeUtc(ym));
    } else if (query.from && query.to) {
      from = query.from;
      to = query.to;
      const range = inclusiveDateRangeUtc(from, to);
      if (!range.start || !range.end) {
        throw new BadRequestException('Informe from e to válidos.');
      }
      start = range.start;
      end = range.end;
    } else {
      throw new BadRequestException(
        'Informe yearMonth ou o par from/to para o resumo.',
      );
    }

    return paidSalesSummaryInRange(this.prisma, start, end, {
      yearMonth,
      from,
      to,
    });
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
      where: { id, ...saleHistoryWhere },
      select: SALE_SELECT,
    });
    if (!sale) {
      throw new NotFoundException('Venda não encontrada');
    }
    const audits = await this.auditsFor([sale.id]);
    return this.toSaleDetail(sale, audits.get(sale.id) ?? []);
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
      ...saleHistoryWhere,
      confirmedAt,
      ...(query.provider ? { provider: query.provider } : {}),
      ...historyStatus(query.status),
    };
  }

  private async auditsFor(ids: string[]) {
    const grouped = new Map<string, RefundAudit[]>();
    if (ids.length === 0) return grouped;
    let rows: AuditQueryRow[] = [];
    try {
      rows = await this.prisma.$queryRaw<AuditQueryRow[]>`
        SELECT
          "purchaseId",
          "kind",
          "creditsRecovered",
          "creditsUnrecovered",
          "refundedAmount",
          "refundId",
          "createdAt"
        FROM "CreditRefundAudit"
        WHERE "purchaseId" IN (${Prisma.join(ids)})
        ORDER BY "createdAt" ASC
      `;
    } catch (error) {
      if (!isMissingAuditTable(error)) throw error;
      this.logger.warn(
        'CreditRefundAudit indisponível; histórico segue sem auditoria',
      );
      return grouped;
    }
    for (const row of rows) {
      const current = grouped.get(row.purchaseId) ?? [];
      current.push(toRefundAudit(row));
      grouped.set(row.purchaseId, current);
    }
    return grouped;
  }

  private toSaleListItem(
    sale: Prisma.CreditPurchaseGetPayload<{ select: typeof SALE_SELECT }>,
    audits: RefundAudit[],
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
      refundKinds: auditKinds(audits),
    };
  }

  private toSaleDetail(
    sale: Prisma.CreditPurchaseGetPayload<{ select: typeof SALE_SELECT }>,
    audits: RefundAudit[],
  ) {
    return {
      ...this.toSaleListItem(sale, audits),
      createdAt: sale.createdAt,
      refundAudits: audits,
      venue: {
        id: sale.venue.id,
        name: sale.venue.name,
        city: sale.venue.city,
        state: sale.venue.state,
      },
    };
  }
}

function historyStatus(
  status?: AdminSalesQueryDto['status'],
): Prisma.CreditPurchaseWhereInput {
  if (status === 'paid') return { status: 'PAID' };
  if (status === 'refunded') return { status: 'REFUNDED' };
  return {};
}

function auditKinds(audits: RefundAudit[]): string[] {
  const kinds: string[] = [];
  for (const audit of audits) {
    if (!kinds.includes(audit.kind)) kinds.push(audit.kind);
  }
  return kinds;
}

function toRefundAudit(row: AuditQueryRow): RefundAudit {
  const audit: RefundAudit = {
    kind: row.kind,
    recordedAt: toIso(row.createdAt),
  };
  const refundedAmount = moneyOrNull(row.refundedAmount);
  const creditsRecovered = integerOrNull(row.creditsRecovered);
  const creditsUnrecovered = integerOrNull(row.creditsUnrecovered);
  const refundId = row.refundId?.trim() ?? '';
  if (refundedAmount != null) audit.refundedAmount = refundedAmount;
  if (creditsRecovered != null) audit.creditsRecovered = creditsRecovered;
  if (creditsUnrecovered != null) audit.creditsUnrecovered = creditsUnrecovered;
  if (refundId) audit.refundId = refundId;
  return audit;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function moneyOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  try {
    return toMoneyNumber(value as Prisma.Decimal | number | string);
  } catch {
    return null;
  }
}

function integerOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function isMissingAuditTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('CreditRefundAudit') || message.includes('42P01');
}
