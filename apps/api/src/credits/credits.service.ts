import { CreditPurchase } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  CARD_PAID_RECONCILE_BATCH,
  CARD_PAID_RECONCILE_MIN_AGE_MS,
  CARD_RECONCILE_GET_TIMEOUT_MS,
  advanceCardReconcileCursor,
  armCardReconcileCooldown,
  cardReconcileCooldownMs,
  claimCardReconcileLease,
  paidCardReconcileWhere,
  readCardReconcileCursor,
  releaseCardReconcileLease,
  renewCardReconcileLease,
  resetCardReconcileCursor,
  settleCardTerminalStatus,
  tryAcquireCardReconcileLease,
} from './card-refund.ledger';
import { observeCreditLedger, type CreditLedgerObserveInput } from './credit-ledger.observe';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CREDIT_PACKAGES, CreditPackageKey } from '../common/constants/credits';
import { isMercadoPagoSandbox, isProduction } from '../common/env';
import {
  AfterPurchaseStatus,
  extractMercadoPagoDataId,
} from './providers/mercado-pago-orders';
import { PrismaService } from '../prisma/prisma.service';
import {
  CARD_INVALID_PAYER_EMAIL_MESSAGE,
  CARD_MAX_INSTALLMENTS,
  CardChargeResult,
  CardReconcileRateLimitError,
  CardReconcileTransportError,
  CardVerifiedOrder,
  assertCardIdempotencyKey,
  assertCardPaymentMethod,
  assertOpaqueCardToken,
  cardOperationProviderTxId,
  cardOperationPurchaseId,
  cardOrderMatchesPurchase,
  cardRefundAction,
  cardTokenFingerprint,
  decidePaidCardReconcileAction,
} from './providers/card.provider';
import {
  CanonicalPaymentProvider,
  StoreProviderInput,
  buildProviderTxId,
  cardOrderIdFromProviderTxId,
  normalizeProviderId,
  pixOrderIdFromProviderTxId,
} from './providers/payment-provider';
import { PaymentProviderRegistry } from './providers/payment-providers';
import {
  PIX_INVALID_PAYER_EMAIL_MESSAGE,
  PixVerifiedOrder,
  PixWebhookMeta,
  PIX_PARTIAL_REVIEW_KIND,
  normalizePixPayerEmail,
  pixPartialMarkerAllowed,
  pixRefundMaySettle,
} from './providers/pix.provider';
import { asMoney, toPublicPurchase } from './purchase-public';
import { AdminPushService } from '../admin/push/admin-push.service';
import {
  FiscalPurchaseInput,
  FiscalSnapshot,
  resolveFiscalSnapshot,
} from './fiscal-document';
import {
  assertMercadoPagoCardChargeAllowed,
  assertMercadoPagoPixChargeAllowed,
} from './providers/mercado-pago-credentials';

export type CardPayOutcome =
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'unknown'
  | 'cancelled'
  | 'refunded';

export type CardPayResponse = {
  purchaseId: string;
  status: string;
  provider: 'card';
  amount: number;
  currency: 'BRL';
  credits: number;
  orderId: string | null;
  idempotencyKey: string;
  outcome: CardPayOutcome;
};

export type CardPayInput = {
  packageKey: string;
  token: string;
  paymentMethodId: string;
  paymentType: string;
  installments: number;
  idempotencyKey: string;
} & FiscalPurchaseInput;

export type CardReconcileRun = {
  skipped: boolean;
  skipReason: 'lock' | 'cooldown' | null;
  checked: number;
  refunded: number;
  partial: number;
  errors: number;
  timeouts: number;
  rateLimited: number;
  leaseLost: boolean;
};

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);
  /** Same-process guard. Cross-instance safety is the stable Mercado Pago idempotency key. */
  private readonly cardCharges = new Map<string, Promise<CardPayResponse>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentProviderRegistry,
    @Optional() private readonly adminPush?: AdminPushService,
  ) {}

  packages() {
    return CREDIT_PACKAGES;
  }

  async wallet(userId: string) {
    const venue = await this.requireVenueOwned(userId);
    const wallet = await this.prisma.creditWallet.findUnique({
      where: { venueId: venue.id },
    });
    return {
      venueId: venue.id,
      balance: wallet?.balance ?? 0,
    };
  }

  async purchases(userId: string) {
    const venue = await this.requireVenueOwned(userId);
    const rows = await this.prisma.creditPurchase.findMany({
      where: { venueId: venue.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPublicPurchase);
  }

  async purchaseById(userId: string, purchaseId: string) {
    const venue = await this.requireVenueOwned(userId);
    const purchase = await this.prisma.creditPurchase.findUnique({
      where: { id: purchaseId },
    });
    if (!purchase || purchase.venueId !== venue.id) {
      throw new NotFoundException('Compra não encontrada');
    }
    const reconciled = await this.reconcilePendingMercadoPagoPurchase(purchase);
    return toPublicPurchase(reconciled);
  }

  /**
   * Checkout stub — creates a PENDING purchase in development only.
   * Does not credit the wallet. Production must use store-confirm or PIX.
   */
  async checkout(userId: string, packageKey: CreditPackageKey) {
    if (isProduction()) {
      throw new ForbiddenException(
        'Checkout de desenvolvimento indisponível em produção.',
      );
    }

    const pack = CREDIT_PACKAGES.find((p) => p.key === packageKey);
    if (!pack) {
      throw new BadRequestException('Pacote inválido');
    }

    const venue = await this.requireVenueOwned(userId);

    const purchase = await this.prisma.creditPurchase.create({
      data: {
        venueId: venue.id,
        packageKey: pack.key,
        productId: pack.storeProductId,
        amountPaid: pack.priceBrl,
        currency: 'BRL',
        credits: pack.credits,
        status: 'PENDING',
        provider: 'stub',
        providerTxId: `stub:${randomUUID()}`,
      },
    });

    return {
      purchase: toPublicPurchase(purchase),
      checkoutUrl: null,
      message:
        'Checkout stub: use POST /credits/dev-confirm/:purchaseId para simular pagamento em desenvolvimento.',
    };
  }

  /** Dev-only helper to simulate payment confirmation. Blocked in production. */
  async confirmPurchaseDev(userId: string, purchaseId: string) {
    if (isProduction()) {
      throw new ForbiddenException(
        'Confirmação de desenvolvimento indisponível em produção.',
      );
    }

    const venue = await this.requireVenueOwned(userId);

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.creditPurchase.findUnique({
        where: { id: purchaseId },
      });
      if (!purchase || purchase.venueId !== venue.id) {
        throw new NotFoundException('Compra não encontrada');
      }
      if (purchase.status === 'PAID') {
        return toPublicPurchase(purchase);
      }
      if (purchase.status !== 'PENDING') {
        throw new BadRequestException('Compra não pode ser confirmada');
      }

      await tx.creditWallet.upsert({
        where: { venueId: venue.id },
        create: { venueId: venue.id, balance: purchase.credits },
        update: { balance: { increment: purchase.credits } },
      });

      const paid = await tx.creditPurchase.update({
        where: { id: purchaseId },
        data: {
          status: 'PAID',
          confirmedAt: new Date(),
        },
      });
      return toPublicPurchase(paid);
    });
  }

  async confirmStorePurchase(
    userId: string,
    dto: {
      packageKey: CreditPackageKey;
      productId: string;
      provider: StoreProviderInput | string;
      purchaseId: string;
      verificationData: string;
    } & FiscalPurchaseInput,
  ) {
    const fiscal = resolveFiscalSnapshot(dto);
    const provider = this.requireStoreProvider(dto.provider);
    const store = this.payments.storeProvider(provider);

    const verified = await store.verify({
      productId: dto.productId,
      purchaseId: dto.purchaseId,
      verificationData: dto.verificationData,
    });

    const pack = CREDIT_PACKAGES.find(
      (item) => item.storeProductId === dto.productId,
    );
    if (!pack) {
      throw new BadRequestException('Produto da loja inválido');
    }
    if (pack.key !== dto.packageKey) {
      throw new BadRequestException('Pacote não confere com o produto da loja');
    }
    if (verified.productId && verified.productId !== dto.productId) {
      throw new BadRequestException('Produto da loja inválido');
    }

    const providerTxId = buildProviderTxId(
      provider,
      verified.externalId || dto.purchaseId || dto.verificationData,
    );
    const venue = await this.requireVenueOwned(userId);

    const purchase = await this.creditVerifiedPurchase({
      venueId: venue.id,
      pack,
      provider,
      providerTxId,
      productId: pack.storeProductId,
      fiscal,
    });
    this.enqueuePurchasePaid(purchase);
    return toPublicPurchase(purchase.record);
  }

  async createPixCharge(
    userId: string,
    packageKey: string,
    authenticatedEmail?: string,
    fiscalInput?: FiscalPurchaseInput,
  ) {
    const fiscal = resolveFiscalSnapshot(fiscalInput);
    const pack = CREDIT_PACKAGES.find((p) => p.key === packageKey);
    if (!pack) {
      throw new BadRequestException('Pacote inválido');
    }

    const pix = this.payments.pixProvider();
    if (!pix.isConfigured) {
      throw new ServiceUnavailableException(
        'PIX payment provider is not configured',
      );
    }
    assertMercadoPagoPixChargeAllowed();

    const venue = await this.requireVenueOwned(userId);
    const sandbox = isMercadoPagoSandbox();
    const email =
      normalizePixPayerEmail(venue.owner?.email) ??
      normalizePixPayerEmail(authenticatedEmail);
    if (!sandbox && !email) {
      this.logger.warn(
        'PIX recusado: e-mail do pagador ausente ou inválido no perfil.',
      );
      throw new BadRequestException(PIX_INVALID_PAYER_EMAIL_MESSAGE);
    }

    const purchase = await this.prisma.creditPurchase.create({
      data: {
        venueId: venue.id,
        packageKey: pack.key,
        productId: null,
        amountPaid: pack.priceBrl,
        currency: 'BRL',
        credits: pack.credits,
        status: 'PENDING',
        provider: 'pix',
        providerTxId: buildProviderTxId('pix', `pending:${randomUUID()}`),
        ...fiscal,
      },
    });

    let charge;
    try {
      charge = await pix.createCharge({
        purchaseId: purchase.id,
        packageKey: pack.key,
        amountBrl: pack.priceBrl,
        payerEmail: email ?? undefined,
        payerName: venue.owner?.name,
        idempotencyKey: randomUUID(),
      });
    } catch (error) {
      await this.prisma.creditPurchase
        .update({
          where: { id: purchase.id },
          data: { status: 'FAILED' },
        })
        .catch(() => undefined);
      throw error;
    }

    const providerTxId = buildProviderTxId('pix', charge.orderId);
    let saved = purchase;
    try {
      saved = await this.prisma.creditPurchase.update({
        where: { id: purchase.id },
        data: { providerTxId },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'P2002') throw error;
      const existing = await this.prisma.creditPurchase.findUnique({
        where: { providerTxId },
      });
      if (!existing) throw error;
      await this.prisma.creditPurchase.update({
        where: { id: purchase.id },
        data: {
          status: 'CANCELLED',
          providerTxId: buildProviderTxId('pix', `duplicate:${purchase.id}`),
        },
      });
      saved = existing;
    }

    return {
      purchaseId: saved.id,
      paymentId: charge.paymentId ?? charge.orderId,
      status: 'PENDING' as const,
      amount: pack.priceBrl,
      currency: 'BRL' as const,
      qrCodeText: charge.qrCodeText,
      qrCodeImage: charge.qrCodeImage,
      expiresAt: charge.expiresAt,
    };
  }

  async handlePixWebhook(payload: unknown, meta: PixWebhookMeta = {}) {
    this.logger.log('Mercado Pago webhook received');
    try {
      const result = await this.processMercadoPagoWebhook(payload, meta);
      this.logger.log('Mercado Pago webhook http 200');
      return result;
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      this.logger.warn(`Mercado Pago webhook http ${status}`);
      throw error;
    }
  }

  private async processMercadoPagoWebhook(
    payload: unknown,
    meta: PixWebhookMeta,
  ) {
    const pix = this.payments.pixProvider();
    if (!pix.isConfigured) {
      throw new ServiceUnavailableException(
        'PIX payment provider is not configured',
      );
    }

    pix.assertWebhookSignature(meta, payload);
    const orderId = pix.extractOrderId(payload, meta.query);
    if (!orderId) {
      const rawId = extractMercadoPagoDataId(payload, meta.query);
      this.logger.warn(
        rawId
          ? 'Mercado Pago webhook order id incompatible'
          : 'Mercado Pago webhook order id absent',
      );
      return { received: true };
    }

    let order;
    try {
      order = await pix.getOrder(orderId);
    } catch (error) {
      this.logger.error(
        `Mercado Pago webhook order ${orderId} result unavailable`,
      );
      throw error;
    }
    this.logger.log(
      `Mercado Pago webhook order ${order.orderId} status ${order.status}`,
    );
    const purchase = await this.findPixPurchase(order);
    if (!purchase) {
      this.logger.warn(
        `Mercado Pago webhook order ${order.orderId} purchase absent`,
      );
      return { received: true };
    }

    if (purchase.provider === 'card') {
      let cardOrder;
      try {
        cardOrder = await this.payments.cardProvider().getOrder(order.orderId);
      } catch (error) {
        this.logger.error(
          `Mercado Pago webhook order ${order.orderId} result unavailable`,
        );
        throw error;
      }
      if (cardOrder.orderId !== order.orderId) {
        this.logger.warn(`Card webhook order mismatch for purchase ${purchase.id}`);
        return { received: true };
      }
      const amount =
        cardOrder.refundedAmountBrl == null
          ? 'ausente'
          : String(cardOrder.refundedAmountBrl);
      this.logger.log(
        `Mercado Pago webhook order ${cardOrder.orderId} refund ${cardOrder.refundScope ?? 'none'} amount ${amount}`,
      );
      const settled = await this.applyVerifiedCardOrder(purchase, cardOrder);
      this.logger.log(
        `Mercado Pago webhook purchase ${purchase.id} status ${settled.purchase.status} audit ${cardOrder.refundScope ?? 'none'}`,
      );
      return toPublicPurchase(settled.purchase);
    }

    const updated = await this.applyVerifiedPixOrder(purchase, order);
    this.logger.log(
      `Mercado Pago webhook purchase ${purchase.id} status ${updated.status} audit none`,
    );
    return toPublicPurchase(updated);
  }

  /**
   * Polling fallback for a lost or delayed webhook.
   * Temporary Mercado Pago errors leave the local row unchanged.
   * Reconciliation never creates a new charge.
   */
  private async reconcilePendingMercadoPagoPurchase(purchase: CreditPurchase) {
    if (purchase.provider === 'card') {
      return this.reconcilePendingCardPurchase(purchase);
    }
    return this.reconcilePendingPixPurchase(purchase);
  }
  private async reconcilePendingPixPurchase(purchase: CreditPurchase) {
    if (purchase.provider !== 'pix' || purchase.status !== 'PENDING') {
      return purchase;
    }
    const orderId = pixOrderIdFromProviderTxId(purchase.providerTxId);
    if (!orderId) return purchase;

    const pix = this.payments.pixProvider();
    if (!pix.isConfigured) return purchase;

    let order: PixVerifiedOrder;
    try {
      order = await pix.getOrder(orderId);
    } catch {
      return purchase;
    }
    return this.applyVerifiedPixOrder(purchase, order);
  }

  /**
   * Pending card purchase with a stored Order id. A timeout that never
   * persisted the Order id stays PENDING: this path does not call createOrder.
   */
  private async reconcilePendingCardPurchase(purchase: CreditPurchase) {
    if (purchase.provider !== 'card' || purchase.status !== 'PENDING') {
      return purchase;
    }
    const orderId = cardOrderIdFromProviderTxId(purchase.providerTxId);
    if (!orderId) {
      this.logger.warn(
        `Card reconciliation purchase ${purchase.id} order ausente status PENDING result pending`,
      );
      return purchase;
    }

    const card = this.payments.cardProvider();
    if (!card.isConfigured) return purchase;

    let order: CardVerifiedOrder;
    try {
      order = await card.getOrder(orderId);
    } catch {
      return purchase;
    }
    const settled = await this.applyVerifiedCardOrder(purchase, order);
    return settled.purchase;
  }

  /** Shared by webhook and GET reconciliation. Wallet increment is compare-and-swap on PENDING. */
  private async applyVerifiedPixOrder(
    purchase: CreditPurchase,
    order: PixVerifiedOrder,
  ): Promise<CreditPurchase> {
    if (order.status === 'PAID') {
      if (order.currency != null && order.currency !== 'BRL') {
        this.logger.warn(`PIX currency mismatch for purchase ${purchase.id}`);
        return purchase;
      }
      const expected = asMoney(purchase.amountPaid);
      if (
        order.amountBrl != null &&
        Math.abs(order.amountBrl - expected) > 0.009
      ) {
        this.logger.warn(`PIX amount mismatch for purchase ${purchase.id}`);
        return purchase;
      }
      const paid = await this.confirmPendingPurchaseAtomic(
        purchase.id,
        buildProviderTxId('pix', order.orderId),
      );
      if (paid.newlyPaid && paid.purchase) {
        this.enqueuePurchasePaid({ record: paid.purchase, created: true });
      }
      return paid.purchase ?? purchase;
    }

    if (order.status === 'FAILED' || order.status === 'CANCELLED') {
      return this.applyPixTerminalStatus(purchase, order);
    }

    if (order.status === 'REFUNDED' && order.refundProof === 'partial') {
      if (
        purchase.status === 'PAID' &&
        purchase.provider === 'pix' &&
        pixPartialMarkerAllowed(purchase, order)
      ) {
        await this.markPixPartialReview(purchase, order);
      } else {
        this.logger.warn(`PIX refund blocked for purchase ${purchase.id}`);
      }
      return purchase;
    }

    if (order.status === 'REFUNDED') {
      if (!pixRefundMaySettle(purchase, order)) {
        this.logger.warn(`PIX refund blocked for purchase ${purchase.id}`);
        return purchase;
      }
      return this.applyPixTerminalStatus(purchase, order);
    }

    return purchase;
  }

  cardCheckoutConfig() {
    assertMercadoPagoCardChargeAllowed();
    const card = this.payments.cardProvider();
    const publicKey = card.publicKey;
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!publicKey || (accessToken && publicKey === accessToken)) {
      throw new ServiceUnavailableException(
        'Cartão de crédito ainda não está disponível.',
      );
    }
    return {
      publicKey,
      maxInstallments: CARD_MAX_INSTALLMENTS,
    };
  }

  async payCard(
    userId: string,
    input: CardPayInput,
    authenticatedEmail?: string,
  ): Promise<CardPayResponse> {
    const fiscal = resolveFiscalSnapshot(input);
    const pack = this.requireCardPack(input);
    const token = input.token.trim();
    assertOpaqueCardToken(token);
    assertCardIdempotencyKey(input.idempotencyKey);
    const paymentMethodId = assertCardPaymentMethod(input.paymentMethodId);
    if (input.paymentType !== 'credit_card' || input.installments !== CARD_MAX_INSTALLMENTS) {
      throw new BadRequestException('Somente cartão de crédito à vista é aceito.');
    }

    const card = this.payments.cardProvider();
    if (!card.isConfigured) {
      throw new ServiceUnavailableException(
        'Card payment provider is not configured',
      );
    }
    assertMercadoPagoCardChargeAllowed();

    const venue = await this.requireVenueOwned(userId);
    const sandbox = isMercadoPagoSandbox();
    const email =
      normalizePixPayerEmail(venue.owner?.email) ??
      normalizePixPayerEmail(authenticatedEmail);
    if (!sandbox && !email) {
      this.logger.warn(
        'Cartão recusado: e-mail do pagador ausente ou inválido no perfil.',
      );
      throw new BadRequestException(CARD_INVALID_PAYER_EMAIL_MESSAGE);
    }

    const purchaseId = cardOperationPurchaseId(venue.id, input.idempotencyKey);
    const fingerprint = cardTokenFingerprint(token);
    const lockKey = `${purchaseId}:${fingerprint}`;
    const inflight = this.cardCharges.get(lockKey);
    if (inflight) return inflight;

    const run = this.executeCardPay({
      venueId: venue.id,
      payerEmail: email ?? undefined,
      payerName: venue.owner?.name,
      purchaseId,
      fingerprint,
      idempotencyKey: input.idempotencyKey,
      token,
      paymentMethodId,
      pack,
      fiscal,
    }).finally(() => {
      if (this.cardCharges.get(lockKey) === run) {
        this.cardCharges.delete(lockKey);
      }
    });
    this.cardCharges.set(lockKey, run);
    return run;
  }

  private requireCardPack(input: CardPayInput) {
    const pack = CREDIT_PACKAGES.find((item) => item.key === input.packageKey);
    if (!pack) {
      throw new BadRequestException('Pacote inválido');
    }
    return pack;
  }

  private async executeCardPay(input: {
    venueId: string;
    payerEmail?: string;
    payerName?: string;
    purchaseId: string;
    fingerprint: string;
    idempotencyKey: string;
    token: string;
    paymentMethodId: string;
    pack: (typeof CREDIT_PACKAGES)[number];
    fiscal: ReturnType<typeof resolveFiscalSnapshot>;
  }): Promise<CardPayResponse> {
    const opTxId = cardOperationProviderTxId(input.purchaseId, input.fingerprint);
    let purchase = await this.prisma.creditPurchase.findUnique({
      where: { id: input.purchaseId },
    });

    if (!purchase) {
      try {
        purchase = await this.prisma.creditPurchase.create({
          data: {
            id: input.purchaseId,
            venueId: input.venueId,
            packageKey: input.pack.key,
            productId: null,
            amountPaid: input.pack.priceBrl,
            currency: 'BRL',
            credits: input.pack.credits,
            status: 'PENDING',
            provider: 'card',
            providerTxId: opTxId,
            ...input.fiscal,
          },
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'P2002') throw error;
        purchase = await this.prisma.creditPurchase.findUnique({
          where: { id: input.purchaseId },
        });
        if (!purchase) throw error;
      }
    }

    if (purchase.venueId !== input.venueId || purchase.provider !== 'card') {
      throw new BadRequestException('Identificador da operação inválido.');
    }
    if (purchase.packageKey !== input.pack.key) {
      throw new BadRequestException('Esta operação já foi usada para outro pacote.');
    }

    if (purchase.status !== 'PENDING') {
      return this.cardPayResponse(
        purchase,
        cardOutcomeForStatus(purchase.status),
        input.idempotencyKey,
      );
    }

    const storedOrderId = cardOrderIdFromProviderTxId(purchase.providerTxId);
    if (!storedOrderId && purchase.providerTxId !== opTxId) {
      throw new BadRequestException(
        'Esta operação já está vinculada a outro token de cartão.',
      );
    }

    if (storedOrderId) {
      let order: CardVerifiedOrder;
      try {
        order = await this.payments.cardProvider().getOrder(storedOrderId);
      } catch {
        this.logger.warn(
          `Card reconciliation purchase ${purchase.id} order ${storedOrderId} status ausente result pending`,
        );
        return this.cardPayResponse(purchase, 'pending', input.idempotencyKey);
      }
      return this.settleCardOrder(purchase, order, input.idempotencyKey);
    }

    let attempt: CardChargeResult;
    try {
      attempt = await this.payments.cardProvider().createCharge({
        purchaseId: input.purchaseId,
        packageKey: input.pack.key,
        amountBrl: input.pack.priceBrl,
        token: input.token,
        paymentMethodId: input.paymentMethodId,
        paymentType: 'credit_card',
        installments: CARD_MAX_INSTALLMENTS,
        payerEmail: input.payerEmail,
        payerName: input.payerName,
        idempotencyKey: `card-order:${input.purchaseId}`,
      });
    } catch {
      this.logger.error(`Card charge result unknown for purchase ${purchase.id}`);
      return this.cardPayResponse(purchase, 'unknown', input.idempotencyKey);
    }

    if (attempt.kind === 'unknown') {
      this.logger.warn(
        `Card reconciliation purchase ${purchase.id} order ausente status PENDING result unknown`,
      );
      return this.cardPayResponse(purchase, 'unknown', input.idempotencyKey);
    }

    if (attempt.kind === 'rejected') {
      const failed = await this.settleCardTerminal(purchase.id, {
        status: 'FAILED',
        refundScope: 'none',
        refundedAmountBrl: null,
        refundId: null,
      });
      this.logger.warn(
        `Card reconciliation purchase ${purchase.id} order ausente status FAILED result rejected`,
      );
      return this.cardPayResponse(failed ?? purchase, 'rejected', input.idempotencyKey);
    }

    if (attempt.confirmWithGet) {
      return this.confirmStoredCardOrder(
        purchase,
        attempt.order.orderId,
        input.idempotencyKey,
      );
    }

    return this.settleCardOrder(purchase, attempt.order, input.idempotencyKey);
  }

  /** Links a known order id, then reads it. A failed read stays PENDING. */
  private async confirmStoredCardOrder(
    purchase: CreditPurchase,
    orderId: string,
    idempotencyKey: string,
  ): Promise<CardPayResponse> {
    const linked = await this.linkCardOrderId(purchase, orderId);
    if (!linked) {
      this.logger.warn(
        `Card reconciliation purchase ${purchase.id} order ${orderId} result unknown`,
      );
      return this.cardPayResponse(purchase, 'unknown', idempotencyKey);
    }
    try {
      const fresh = await this.payments.cardProvider().getOrder(orderId);
      this.logger.log(
        `Card reconciliation purchase ${purchase.id} order ${fresh.orderId} status ${fresh.status} result consulted`,
      );
      return this.settleCardOrder(linked, fresh, idempotencyKey);
    } catch {
      this.logger.warn(
        `Card reconciliation purchase ${purchase.id} order ${orderId} status ausente result pending`,
      );
      return this.cardPayResponse(linked, 'pending', idempotencyKey);
    }
  }

  private async settleCardOrder(
    purchase: CreditPurchase,
    order: CardVerifiedOrder,
    idempotencyKey: string,
  ): Promise<CardPayResponse> {
    const settled = await this.applyVerifiedCardOrder(purchase, order);
    return this.cardPayResponse(settled.purchase, settled.outcome, idempotencyKey);
  }

  private async applyVerifiedCardOrder(
    purchase: CreditPurchase,
    order: CardVerifiedOrder,
  ): Promise<{ purchase: CreditPurchase; outcome: CardPayOutcome }> {
    const linked = await this.linkCardOrderId(purchase, order.orderId);
    if (!linked) {
      this.logger.warn(`Card order link conflict for purchase ${purchase.id}`);
      return { purchase, outcome: 'unknown' };
    }
    purchase = linked;

    if (!this.cardOrderAccepted(purchase, order)) {
      this.logger.warn(`Card order mismatch for purchase ${purchase.id}`);
      return { purchase, outcome: 'pending' };
    }

    const refundAction = cardRefundAction(order);
    if (refundAction === 'review') {
      const reviewed = await this.settleCardTerminal(purchase.id, {
        status: 'REFUNDED',
        refundScope: 'review',
        refundedAmountBrl: null,
        refundId: null,
      });
      this.logger.error(
        `Card refund review purchase ${purchase.id} order ${order.orderId} result review`,
      );
      const record = reviewed ?? purchase;
      return {
        purchase: record,
        outcome: record.status === 'PAID' ? 'approved' : 'pending',
      };
    }

    if (refundAction === 'partial') {
      const reviewed = await this.settleCardTerminal(purchase.id, {
        status: 'REFUNDED',
        refundScope: 'partial',
        refundedAmountBrl: order.refundedAmountBrl ?? null,
        refundId: order.refundId ?? null,
      });
      this.logger.error(
        `Card partial refund requires manual review for purchase ${purchase.id} order ${order.orderId}`,
      );
      const record = reviewed ?? purchase;
      return {
        purchase: record,
        outcome: record.status === 'PAID' ? 'approved' : 'pending',
      };
    }

    if (order.status === 'PAID') {
      const paid = await this.confirmPendingPurchaseAtomic(
        purchase.id,
        buildProviderTxId('card', order.orderId),
      );
      if (paid.newlyPaid && paid.purchase) {
        this.enqueuePurchasePaid({ record: paid.purchase, created: true });
      }
      const record = paid.purchase ?? purchase;
      return {
        purchase: record,
        outcome:
          record.status === 'PAID' ? 'approved' : cardOutcomeForStatus(record.status),
      };
    }

    if (refundAction === 'terminal' || refundAction === 'full') {
      const next = await this.settleCardTerminal(purchase.id, {
        status: refundAction === 'full' ? 'REFUNDED' : order.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
        refundScope: refundAction === 'full' ? 'full' : 'none',
        refundedAmountBrl: order.refundedAmountBrl ?? null,
        refundId: order.refundId ?? null,
      });
      if (refundAction === 'full' && purchase.status === 'PAID' && next?.status === 'REFUNDED') {
        this.noteCreditLedger({
          kind: 'card_full_refund',
          purchaseId: purchase.id,
          venueId: purchase.venueId,
          purchaseCredits: purchase.credits,
          confirmed: true,
          verified: true,
        });
      }
      const outcome: CardPayOutcome =
        refundAction === 'full'
          ? 'refunded'
          : order.status === 'CANCELLED'
            ? 'cancelled'
            : 'rejected';
      return { purchase: next ?? purchase, outcome };
    }

    return { purchase, outcome: 'pending' };
  }

  private cardOrderAccepted(
    purchase: CreditPurchase,
    order: CardVerifiedOrder,
  ): boolean {
    return cardOrderMatchesPurchase(purchase, order);
  }

  private async linkCardOrderId(
    purchase: CreditPurchase,
    orderId: string,
  ): Promise<CreditPurchase | null> {
    const nextTx = buildProviderTxId('card', orderId);
    if (purchase.providerTxId === nextTx) return purchase;
    const current = cardOrderIdFromProviderTxId(purchase.providerTxId);
    if (current && current !== orderId) return null;
    try {
      return await this.prisma.creditPurchase.update({
        where: { id: purchase.id },
        data: { providerTxId: nextTx },
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'P2002') throw error;
      return null;
    }
  }

  private cardPayResponse(
    purchase: CreditPurchase,
    outcome: CardPayOutcome,
    idempotencyKey: string,
  ): CardPayResponse {
    return {
      purchaseId: purchase.id,
      status: purchase.status,
      provider: 'card',
      amount: asMoney(purchase.amountPaid),
      currency: 'BRL',
      credits: purchase.credits,
      orderId: cardOrderIdFromProviderTxId(purchase.providerTxId),
      idempotencyKey,
      outcome,
    };
  }

  private requireStoreProvider(raw: string): CanonicalPaymentProvider {
    const provider = normalizeProviderId(raw);
    if (provider === 'google_play' || provider === 'app_store') {
      return provider;
    }
    throw new BadRequestException('Provedor de pagamento inválido');
  }

  private async findPixPurchase(order: {
    orderId: string;
    paymentId: string | null;
    externalReference: string | null;
  }) {
    const ids = [
      buildProviderTxId('pix', order.orderId),
      order.paymentId ? buildProviderTxId('pix', order.paymentId) : null,
      buildProviderTxId('card', order.orderId),
      order.paymentId ? buildProviderTxId('card', order.paymentId) : null,
    ].filter((id): id is string => Boolean(id));

    for (const providerTxId of ids) {
      const found = await this.prisma.creditPurchase.findUnique({
        where: { providerTxId },
      });
      if (found) return found;
    }

    if (order.externalReference) {
      const found = await this.prisma.creditPurchase.findUnique({
        where: { id: order.externalReference },
      });
      if (found && (found.provider === 'pix' || found.provider === 'card')) {
        return found;
      }
    }
    return null;
  }

  private async confirmPendingPurchaseAtomic(
    purchaseId: string,
    providerTxId: string,
  ): Promise<{ purchase: CreditPurchase | null; newlyPaid: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.creditPurchase.updateMany({
        where: { id: purchaseId, status: 'PENDING' },
        data: {
          status: 'PAID',
          confirmedAt: new Date(),
          providerTxId,
        },
      });
      if (claimed.count === 0) {
        const existing = await tx.creditPurchase.findUnique({
          where: { id: purchaseId },
        });
        return { purchase: existing, newlyPaid: false };
      }

      const paid = await tx.creditPurchase.findUnique({
        where: { id: purchaseId },
      });
      if (!paid) return { purchase: null, newlyPaid: false };

      await tx.creditWallet.upsert({
        where: { venueId: paid.venueId },
        create: { venueId: paid.venueId, balance: paid.credits },
        update: { balance: { increment: paid.credits } },
      });
      return { purchase: paid, newlyPaid: true };
    });
  }

  private settleCardTerminal(
    purchaseId: string,
    input: {
      status: 'FAILED' | 'CANCELLED' | 'REFUNDED';
      refundScope: 'none' | 'partial' | 'full' | 'review';
      refundedAmountBrl: number | null;
      refundId: string | null;
    },
  ) {
    return this.prisma.$transaction((tx) =>
      settleCardTerminalStatus(tx, { purchaseId, ...input }),
    );
  }

  /**
   * Re-checks the lease inside the same transaction that settles the refund.
   * A lease lost after the in-memory check rolls nothing into the purchase.
   */
  private settleReconciledCardRefund(
    token: string,
    purchaseId: string,
    input: {
      status: 'REFUNDED';
      refundScope: 'partial' | 'full' | 'review';
      refundedAmountBrl: number | null;
      refundId: string | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const held = await claimCardReconcileLease(tx, new Date(), token);
      if (!held) return { owned: false as const, purchase: null };
      const purchase = await settleCardTerminalStatus(tx, { purchaseId, ...input });
      return { owned: true as const, purchase };
    });
  }

  /**
   * Reads paid card orders from Mercado Pago and applies refunds already
   * missed by the webhook. Does not create charges or request refunds.
   * The scheduler calls this only when CARD_REFUND_RECONCILE_ENABLED is true.
   */
  async reconcilePaidCardPurchases(now = new Date()): Promise<CardReconcileRun> {
    const empty: CardReconcileRun = {
      skipped: false,
      skipReason: null,
      checked: 0,
      refunded: 0,
      partial: 0,
      errors: 0,
      timeouts: 0,
      rateLimited: 0,
      leaseLost: false,
    };
    const token = randomUUID();
    let acquired = false;
    try {
      acquired = await tryAcquireCardReconcileLease(this.prisma, now, token);
    } catch (error) {
      this.logger.error(
        `Card paid reconciliation lease unavailable result retry ${this.reconcileErrorText(error)}`,
      );
      return { ...empty, skipped: true, skipReason: 'lock' };
    }
    if (!acquired) return { ...empty, skipped: true, skipReason: 'lock' };

    try {
      const card = this.payments.cardProvider();
      if (!card.isConfigured) {
        this.logger.error('Card paid reconciliation provider ausente result retry');
        return empty;
      }
      const held = await readCardReconcileCursor(this.prisma, now, token);
      if (!held.owned) return empty;
      if (held.cooldownUntil && held.cooldownUntil.getTime() > now.getTime()) {
        return { ...empty, skipped: true, skipReason: 'cooldown' };
      }

      const cutoff = new Date(now.getTime() - CARD_PAID_RECONCILE_MIN_AGE_MS);
      const rows = await this.prisma.creditPurchase.findMany({
        where: paidCardReconcileWhere(cutoff, held.cursor),
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
        take: CARD_PAID_RECONCILE_BATCH,
      });
      if (rows.length === 0) {
        if (held.cursor) {
          await resetCardReconcileCursor(this.prisma, new Date(), token);
        }
        return empty;
      }

      let refunded = 0;
      let partial = 0;
      let errors = 0;
      let timeouts = 0;
      let rateLimited = 0;
      let checked = 0;
      let owned = true;
      let halted = false;
      let leaseLost = false;
      for (const purchase of rows) {
        owned = await renewCardReconcileLease(this.prisma, new Date(), token);
        if (!owned) {
          halted = true;
          leaseLost = true;
          break;
        }
        checked += 1;
        const orderId = cardOrderIdFromProviderTxId(purchase.providerTxId);
        if (!orderId) {
          this.logger.warn(
            `Card paid reconciliation purchase ${purchase.id} order ausente result retry`,
          );
          errors += 1;
        } else {
          let order: CardVerifiedOrder | null = null;
          try {
            order = await card.getOrder(orderId, {
              timeoutMs: CARD_RECONCILE_GET_TIMEOUT_MS,
            });
          } catch (error) {
            errors += 1;
            if (error instanceof CardReconcileRateLimitError) {
              rateLimited += 1;
              const waitMs = cardReconcileCooldownMs(
                error.retryAfterHeader,
                new Date(),
              );
              const armed = await armCardReconcileCooldown(
                this.prisma,
                new Date(),
                token,
                new Date(Date.now() + waitMs),
              );
              if (!armed) {
                owned = false;
                leaseLost = true;
              }
              halted = true;
              this.logger.error(
                `Card paid reconciliation purchase ${purchase.id} order ${orderId} result rate_limit`,
              );
              break;
            }
            if (error instanceof CardReconcileTransportError && error.kind === 'timeout') {
              timeouts += 1;
            }
            const kind =
              error instanceof CardReconcileTransportError ? error.kind : 'retry';
            const detail = kind === 'retry' ? ` ${this.reconcileErrorText(error)}` : '';
            this.logger.error(
              `Card paid reconciliation purchase ${purchase.id} order ${orderId} result ${kind}${detail}`,
            );
            order = null;
          }
          if (order) {
            owned = await renewCardReconcileLease(this.prisma, new Date(), token);
            if (!owned) {
              halted = true;
              leaseLost = true;
              break;
            }
            const refundAction = cardRefundAction(order);
            const decision = decidePaidCardReconcileAction(orderId, purchase, order);
            if (decision === 'review') {
              let recorded: { owned: boolean };
              try {
                recorded = await this.settleReconciledCardRefund(token, purchase.id, {
                  status: 'REFUNDED',
                  refundScope: 'review',
                  refundedAmountBrl: null,
                  refundId: null,
                });
              } catch (error) {
                errors += 1;
                halted = true;
                this.logger.error(
                  `Card paid reconciliation purchase ${purchase.id} order ${orderId} result retry ${this.reconcileErrorText(error)}`,
                );
                break;
              }
              if (!recorded.owned) {
                owned = false;
                halted = true;
                leaseLost = true;
                break;
              }
              this.logger.error(
                `Card refund review purchase ${purchase.id} order ${orderId} result review`,
              );
            } else if (decision === 'partial' || decision === 'full') {
              let settled: { owned: boolean };
              try {
                settled = await this.settleReconciledCardRefund(token, purchase.id, {
                  status: 'REFUNDED',
                  refundScope: decision,
                  refundedAmountBrl: order.refundedAmountBrl ?? null,
                  refundId: order.refundId ?? null,
                });
              } catch (error) {
                errors += 1;
                halted = true;
                this.logger.error(
                  `Card paid reconciliation purchase ${purchase.id} order ${orderId} result retry ${this.reconcileErrorText(error)}`,
                );
                break;
              }
              if (!settled.owned) {
                owned = false;
                halted = true;
                leaseLost = true;
                break;
              }
              if (decision === 'partial') partial += 1;
              else refunded += 1;
            } else if (
              refundAction === 'partial' ||
              refundAction === 'full' ||
              refundAction === 'review'
            ) {
              errors += 1;
              this.logger.warn(
                `Card paid reconciliation purchase ${purchase.id} order ${orderId} result mismatch`,
              );
            }
          }
        }
        if (halted || !owned) break;
        if (!(purchase.confirmedAt instanceof Date)) {
          owned = false;
          halted = true;
          break;
        }
        owned = await advanceCardReconcileCursor(this.prisma, new Date(), token, {
          confirmedAt: purchase.confirmedAt,
          purchaseId: purchase.id,
        });
        if (!owned) {
          halted = true;
          leaseLost = true;
          break;
        }
      }
      if (owned && !halted && rows.length < CARD_PAID_RECONCILE_BATCH) {
        await resetCardReconcileCursor(this.prisma, new Date(), token);
      }
      return {
        skipped: false,
        skipReason: null,
        checked,
        refunded,
        partial,
        errors,
        timeouts,
        rateLimited,
        leaseLost,
      };
    } finally {
      try {
        await releaseCardReconcileLease(this.prisma, new Date(), token);
      } catch {
        this.logger.error('Card paid reconciliation lease release result retry');
      }
    }
  }

  private reconcileErrorText(error: unknown): string {
    const text = error instanceof Error ? error.message : 'erro';
    return text.replace(/\s+/g, ' ').slice(0, 120);
  }

  /**
   * One `pix_partial_review` row per purchase. A later partial does not insert
   * another row and does not replace the first proven amount.
   */
  private async markPixPartialReview(
    purchase: CreditPurchase,
    order: PixVerifiedOrder,
  ): Promise<void> {
    const proven = order.provenPartialRefund;
    if (!proven) return;
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO "CreditRefundAudit" (
        "id",
        "purchaseId",
        "venueId",
        "kind",
        "creditsRecovered",
        "creditsUnrecovered",
        "originalAmount",
        "refundedAmount",
        "refundId",
        "createdAt"
      ) VALUES (
        ${randomUUID()},
        ${purchase.id},
        ${purchase.venueId},
        ${PIX_PARTIAL_REVIEW_KIND},
        ${null},
        ${null},
        ${asMoney(purchase.amountPaid)},
        ${proven.refundedAmountBrl},
        ${proven.refundId},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("purchaseId", "kind") DO NOTHING
    `;
    if (Number(inserted) > 0) {
      this.noteCreditLedger({
        kind: 'pix_partial',
        purchaseId: purchase.id,
        venueId: purchase.venueId,
        confirmed: true,
        verified: true,
      });
    }
  }

  private async applyPixTerminalStatus(
    purchase: CreditPurchase,
    order: { status: AfterPurchaseStatus },
  ): Promise<CreditPurchase> {
    const next = order.status;
    if (purchase.status === 'PAID') {
      if (next !== 'REFUNDED') return purchase;
      let settled = false;
      const result = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.creditPurchase.updateMany({
          where: { id: purchase.id, status: 'PAID' },
          data: { status: 'REFUNDED' },
        });
        if (claimed.count === 0) {
          return (
            (await tx.creditPurchase.findUnique({
              where: { id: purchase.id },
            })) ?? purchase
          );
        }
        await tx.creditWallet.upsert({
          where: { venueId: purchase.venueId },
          create: { venueId: purchase.venueId, balance: 0 },
          update: { balance: { increment: -purchase.credits } },
        });
        settled = true;
        return (
          (await tx.creditPurchase.findUnique({
            where: { id: purchase.id },
          })) ?? purchase
        );
      });
      if (settled) {
        this.noteCreditLedger({
          kind: 'pix_full_refund',
          purchaseId: purchase.id,
          venueId: purchase.venueId,
          purchaseCredits: purchase.credits,
          confirmed: true,
          verified: true,
        });
      }
      return result;
    }

    if (purchase.status !== 'PENDING') return purchase;
    return this.prisma.creditPurchase.update({
      where: { id: purchase.id },
      data: { status: next },
    });
  }

  private async creditVerifiedPurchase(input: {
    venueId: string;
    pack: (typeof CREDIT_PACKAGES)[number];
    provider: CanonicalPaymentProvider;
    providerTxId: string;
    productId: string;
    fiscal?: FiscalSnapshot;
  }): Promise<{ record: CreditPurchase; created: boolean }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.creditPurchase.findUnique({
          where: { providerTxId: input.providerTxId },
        });
        if (existing) {
          if (existing.venueId !== input.venueId) {
            throw new BadRequestException('Esta compra já foi utilizada.');
          }
          return { record: existing, created: false };
        }

        const purchase = await tx.creditPurchase.create({
          data: {
            venueId: input.venueId,
            packageKey: input.pack.key,
            productId: input.productId,
            amountPaid: input.pack.priceBrl,
            currency: 'BRL',
            credits: input.pack.credits,
            status: 'PAID',
            provider: input.provider,
            providerTxId: input.providerTxId,
            confirmedAt: new Date(),
            ...(input.fiscal ?? resolveFiscalSnapshot(null)),
          },
        });

        await tx.creditWallet.upsert({
          where: { venueId: input.venueId },
          create: { venueId: input.venueId, balance: input.pack.credits },
          update: { balance: { increment: input.pack.credits } },
        });

        return { record: purchase, created: true };
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        const again = await this.prisma.creditPurchase.findUnique({
          where: { providerTxId: input.providerTxId },
        });
        if (again && again.venueId === input.venueId) {
          return { record: again, created: false };
        }
        if (again) {
          throw new BadRequestException('Esta compra já foi utilizada.');
        }
      }
      throw error;
    }
  }

  private enqueuePurchasePaid(input: {
    record: CreditPurchase;
    created: boolean;
  }) {
    if (!input.created) return;
    void this.adminPush?.notifyPurchasePaid(input.record).catch(() => {
      this.logger.warn(`Admin FCM skipped after purchase ${input.record.id}`);
    });
  }

  private noteCreditLedger(input: CreditLedgerObserveInput): void {
    try {
      observeCreditLedger(input);
    } catch {
      // Observation cannot change the financial result or the API response.
    }
  }

  private async requireVenueOwned(userId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { ownerUserId: userId },
      include: { owner: { select: { email: true, name: true } } },
    });
    if (!venue) {
      throw new ForbiddenException('Conta não é de estabelecimento');
    }
    return venue;
  }
}

function cardOutcomeForStatus(status: string): CardPayOutcome {
  switch (status) {
    case 'PAID':
      return 'approved';
    case 'FAILED':
      return 'rejected';
    case 'CANCELLED':
      return 'cancelled';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'pending';
  }
}
