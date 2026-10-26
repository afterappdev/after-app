import { PurchaseStatus } from '@prisma/client';
import { AccountLifecycleService } from '../../src/users/account-lifecycle.service';
import {
  listFinancialPurgeBlockers,
} from '../../src/users/account-purge.financial';
import {
  cleanupSoftDeleteFixtures,
  createVenueOwner,
  openIsolatedPrisma,
  seedPurchase,
  softDeleteSuiteEnabled,
} from './soft-delete.harness';

const suite = softDeleteSuiteEnabled() ? describe : describe.skip;

async function simulateIdempotentPaidWebhook(
  prisma: Awaited<ReturnType<typeof openIsolatedPrisma>>,
  purchaseId: string,
  venueId: string,
  providerTxId: string,
  credits: number,
) {
  const updated = await prisma.creditPurchase.updateMany({
    where: { id: purchaseId, status: PurchaseStatus.PENDING },
    data: {
      status: PurchaseStatus.PAID,
      providerTxId,
      confirmedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    return { granted: false };
  }
  await prisma.creditWallet.update({
    where: { venueId },
    data: { balance: { increment: credits } },
  });
  return { granted: true };
}

suite('soft delete late payment webhooks (isolated postgres, simulated)', () => {
  afterEach(async () => {
    const prisma = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(prisma);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('PIX/cartão/Apple/Google/reembolso tardios: compra identificável, sem recriar conta, sem crédito duplicado', async () => {
    const prisma = await openIsolatedPrisma();
    try {
      const lifecycle = new AccountLifecycleService(prisma as never);
      const { userId, venueId } = await createVenueOwner(prisma);
      await lifecycle.scheduleAccountDeletion(userId);
      const userAfterSchedule = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(userAfterSchedule.deletionRequestedAt).not.toBeNull();

      const pix = await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PENDING,
        provider: 'mercadopago_pix',
        providerTxId: null,
        createdAt: new Date(),
      });
      const card = await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PENDING,
        provider: 'mercadopago_card',
        providerTxId: 'card-auth-hold',
        createdAt: new Date(),
      });
      const apple = await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PENDING,
        provider: 'apple_storekit2',
        providerTxId: null,
        createdAt: new Date(),
      });
      const google = await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PENDING,
        provider: 'google_play_billing',
        providerTxId: null,
        createdAt: new Date(),
      });

      let blockers = await listFinancialPurgeBlockers(prisma as never, userId);
      expect(blockers).toContain('purchase_pending_recent');
      expect(blockers).toContain('purchase_settlement_pending');

      const wallet0 = await prisma.creditWallet.findUniqueOrThrow({
        where: { venueId },
      });

      const pixGrant = await simulateIdempotentPaidWebhook(
        prisma,
        pix.id,
        venueId,
        'pix-tx-late-1',
        pix.credits,
      );
      expect(pixGrant.granted).toBe(true);
      const pixDup = await simulateIdempotentPaidWebhook(
        prisma,
        pix.id,
        venueId,
        'pix-tx-late-1',
        pix.credits,
      );
      expect(pixDup.granted).toBe(false);
      const wallet1 = await prisma.creditWallet.findUniqueOrThrow({
        where: { venueId },
      });
      expect(wallet1.balance).toBe(wallet0.balance + pix.credits);

      await simulateIdempotentPaidWebhook(
        prisma,
        card.id,
        venueId,
        'card-capture-late',
        card.credits,
      );
      await simulateIdempotentPaidWebhook(
        prisma,
        apple.id,
        venueId,
        'apple-tx-late',
        apple.credits,
      );
      await simulateIdempotentPaidWebhook(
        prisma,
        google.id,
        venueId,
        'google-token-late',
        google.credits,
      );

      const stillOneUser = await prisma.user.count({ where: { id: userId } });
      expect(stillOneUser).toBe(1);

      blockers = await listFinancialPurgeBlockers(prisma as never, userId);
      expect(blockers).not.toContain('purchase_pending_recent');
      expect(blockers).not.toContain('purchase_settlement_pending');

      const refundPurchase = await seedPurchase(prisma, venueId, {
        status: PurchaseStatus.PAID,
        provider: 'mercadopago_pix',
        providerTxId: 'refund-target',
      });
      await prisma.creditRefundAudit.create({
        data: {
          purchaseId: refundPurchase.id,
          venueId,
          kind: 'refund_review',
          creditsUnrecovered: 10,
        },
      });
      blockers = await listFinancialPurgeBlockers(prisma as never, userId);
      expect(blockers).toContain('refund_signal_under_review');

      expect(
        await prisma.creditPurchase.findUnique({ where: { id: pix.id } }),
      ).toMatchObject({ providerTxId: 'pix-tx-late-1', status: PurchaseStatus.PAID });
    } finally {
      await prisma.$disconnect();
    }
  });
});
