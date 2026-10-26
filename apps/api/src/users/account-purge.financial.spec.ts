import {
  assessFinancialPurge,
  listFinancialPurgeBlockers,
  PURGE_RECENT_PENDING_MS,
} from './account-purge.financial';
import { PurchaseStatus } from '@prisma/client';

function prismaMock(handlers: {
  openObligations?: number;
  pendingWithProviderTx?: number;
  pendingRecentNoProviderTx?: number;
  pendingStaleProviderNoTx?: number;
  pendingStaleAbandoned?: number;
  refundReview?: number;
  ledger?: number;
  vip?: number;
}) {
  return {
    venue: {
      findUnique: jest.fn().mockResolvedValue({ id: 'v1' }),
    },
    creditObligation: {
      count: jest.fn().mockResolvedValue(handlers.openObligations ?? 0),
    },
    creditPurchase: {
      count: jest.fn().mockImplementation(async (args: { where: Record<string, unknown> }) => {
        const where = args.where as {
          providerTxId?: { not: null } | null;
          provider?: { not: null } | null;
          createdAt?: { gte?: Date; lt?: Date };
        };
        if (where.providerTxId?.not === null) {
          return handlers.pendingWithProviderTx ?? 0;
        }
        if (
          where.providerTxId === null &&
          where.createdAt?.gte &&
          where.provider === undefined
        ) {
          return handlers.pendingRecentNoProviderTx ?? 0;
        }
        if (
          where.providerTxId === null &&
          where.provider?.not === null &&
          where.createdAt?.lt
        ) {
          return handlers.pendingStaleProviderNoTx ?? 0;
        }
        if (
          where.providerTxId === null &&
          where.provider === null &&
          where.createdAt?.lt
        ) {
          return handlers.pendingStaleAbandoned ?? 0;
        }
        return 0;
      }),
    },
    creditRefundAudit: {
      count: jest.fn().mockResolvedValue(handlers.refundReview ?? 0),
    },
    creditLedgerEntry: {
      count: jest.fn().mockResolvedValue(handlers.ledger ?? 0),
    },
    vipCreditEntry: {
      count: jest.fn().mockResolvedValue(handlers.vip ?? 0),
    },
  };
}

describe('account-purge.financial', () => {
  it('detecta obrigação aberta', async () => {
    const prisma = prismaMock({ openObligations: 1 });
    const reasons = await listFinancialPurgeBlockers(prisma as never, 'u1');
    expect(reasons).toContain('credit_obligation_open');
  });

  it('detecta compra PENDING com providerTxId', async () => {
    const prisma = prismaMock({ pendingWithProviderTx: 2 });
    const reasons = await listFinancialPurgeBlockers(prisma as never, 'u1');
    expect(reasons).toContain('purchase_settlement_pending');
  });

  it('detecta compra PENDING recente sem providerTxId', async () => {
    const prisma = prismaMock({ pendingRecentNoProviderTx: 1 });
    const reasons = await listFinancialPurgeBlockers(prisma as never, 'u1');
    expect(reasons).toContain('purchase_pending_recent');
  });

  it('bloqueia PENDING antiga com provider mas sem providerTxId', async () => {
    const prisma = prismaMock({ pendingStaleProviderNoTx: 1 });
    const reasons = await listFinancialPurgeBlockers(prisma as never, 'u1');
    expect(reasons).toContain('purchase_pending_stale_with_provider');
  });

  it('PENDING abandonada antiga exige status terminal', async () => {
    const prisma = prismaMock({ pendingStaleAbandoned: 1 });
    const assessment = await assessFinancialPurge(prisma as never, 'u1');
    expect(assessment.blockers).toContain('purchase_pending_abandoned_unverified');
    expect(assessment.notes).toContain('purchase_pending_needs_terminal_status');
  });

  it('detecta refund_review', async () => {
    const prisma = prismaMock({ refundReview: 1 });
    const reasons = await listFinancialPurgeBlockers(prisma as never, 'u1');
    expect(reasons).toContain('refund_signal_under_review');
  });

  it('sem venue não bloqueia', async () => {
    const prisma = {
      venue: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const reasons = await listFinancialPurgeBlockers(prisma as never, 'u1');
    expect(reasons).toEqual([]);
  });

  it('usa janela recente de 7 dias', () => {
    expect(PURGE_RECENT_PENDING_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(PurchaseStatus.PENDING).toBe('PENDING');
  });
});
