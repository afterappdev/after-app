import { PurchaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Recent checkout may still receive webhooks even without providerTxId persisted yet. */
export const PURGE_RECENT_PENDING_MS = 7 * 24 * 60 * 60 * 1000;

export class FinancialPurgeBlockedError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`financial_purge_blocked:${reasons.join(',')}`);
    this.name = 'FinancialPurgeBlockedError';
  }
}

export type FinancialPurgeAssessment = {
  blockers: string[];
  notes: string[];
};

export async function assessFinancialPurge(
  prisma: PrismaService,
  userId: string,
  now = new Date(),
): Promise<FinancialPurgeAssessment> {
  const venue = await prisma.venue.findUnique({
    where: { ownerUserId: userId },
    select: { id: true },
  });
  if (!venue) {
    return { blockers: [], notes: [] };
  }

  const blockers: string[] = [];
  const notes: string[] = [];
  const recentCutoff = new Date(now.getTime() - PURGE_RECENT_PENDING_MS);

  const openObligations = await prisma.creditObligation.count({
    where: { venueId: venue.id, status: 'open' },
  });
  if (openObligations > 0) {
    blockers.push('credit_obligation_open');
  }

  const pendingWithProviderTx = await prisma.creditPurchase.count({
    where: {
      venueId: venue.id,
      status: PurchaseStatus.PENDING,
      providerTxId: { not: null },
    },
  });
  if (pendingWithProviderTx > 0) {
    blockers.push('purchase_settlement_pending');
  }

  const pendingRecentNoProviderTx = await prisma.creditPurchase.count({
    where: {
      venueId: venue.id,
      status: PurchaseStatus.PENDING,
      providerTxId: null,
      createdAt: { gte: recentCutoff },
    },
  });
  if (pendingRecentNoProviderTx > 0) {
    blockers.push('purchase_pending_recent');
  }

  const pendingStaleProviderNoTx = await prisma.creditPurchase.count({
    where: {
      venueId: venue.id,
      status: PurchaseStatus.PENDING,
      providerTxId: null,
      provider: { not: null },
      createdAt: { lt: recentCutoff },
    },
  });
  if (pendingStaleProviderNoTx > 0) {
    blockers.push('purchase_pending_stale_with_provider');
  }

  const pendingStaleAbandoned = await prisma.creditPurchase.count({
    where: {
      venueId: venue.id,
      status: PurchaseStatus.PENDING,
      providerTxId: null,
      provider: null,
      createdAt: { lt: recentCutoff },
    },
  });
  if (pendingStaleAbandoned > 0) {
    blockers.push('purchase_pending_abandoned_unverified');
    notes.push('purchase_pending_needs_terminal_status');
  }

  const refundReview = await prisma.creditRefundAudit.count({
    where: { venueId: venue.id, kind: 'refund_review' },
  });
  if (refundReview > 0) {
    blockers.push('refund_signal_under_review');
  }

  const ledgerRows = await prisma.creditLedgerEntry.count({
    where: { venueId: venue.id },
  });
  if (ledgerRows > 0) {
    notes.push('credit_ledger_retained');
  }

  const vipEntries = await prisma.vipCreditEntry.count({
    where: { venueId: venue.id },
  });
  if (vipEntries > 0) {
    notes.push('vip_credit_retained');
  }

  return { blockers, notes };
}

export async function listFinancialPurgeBlockers(
  prisma: PrismaService,
  userId: string,
  now = new Date(),
): Promise<string[]> {
  const assessment = await assessFinancialPurge(prisma, userId, now);
  return assessment.blockers;
}

export async function anonymizeVenueFinancialPii(
  prisma: PrismaService,
  venueId: string,
): Promise<void> {
  await prisma.creditPurchase.updateMany({
    where: { venueId },
    data: {
      fiscalPersonType: null,
      fiscalName: null,
      fiscalDocument: null,
      fiscalEmail: null,
      invoiceRequested: false,
    },
  });
}
