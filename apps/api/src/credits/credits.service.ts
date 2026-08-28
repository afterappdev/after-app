import { CreditPurchase } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CREDIT_PACKAGES, CreditPackageKey } from '../common/constants/credits';
import { isMercadoPagoSandbox, isProduction } from '../common/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  CanonicalPaymentProvider,
  StoreProviderInput,
  buildProviderTxId,
  normalizeProviderId,
  pixOrderIdFromProviderTxId,
} from './providers/payment-provider';
import { PaymentProviderRegistry } from './providers/payment-providers';
import {
  PIX_INVALID_PAYER_EMAIL_MESSAGE,
  PixVerifiedOrder,
  PixWebhookMeta,
  normalizePixPayerEmail,
} from './providers/pix.provider';
import { asMoney, toPublicPurchase } from './purchase-public';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentProviderRegistry,
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
    const reconciled = await this.reconcilePendingPixPurchase(purchase);
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
    },
  ) {
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
    });
    return toPublicPurchase(purchase);
  }

  async createPixCharge(
    userId: string,
    packageKey: string,
    authenticatedEmail?: string,
  ) {
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
    if (isProduction() && isMercadoPagoSandbox()) {
      throw new ServiceUnavailableException(
        'PIX Sandbox não pode ser usado em produção.',
      );
    }

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
    const pix = this.payments.pixProvider();
    if (!pix.isConfigured) {
      throw new ServiceUnavailableException(
        'PIX payment provider is not configured',
      );
    }

    pix.assertWebhookSignature(meta, payload);
    const orderId = pix.extractOrderId(payload, meta.query);
    if (!orderId) {
      this.logger.warn('PIX webhook without Mercado Pago Order id');
      return { received: true };
    }

    const order = await pix.getOrder(orderId);
    const purchase = await this.findPixPurchase(order);
    if (!purchase) {
      return { received: true };
    }

    const updated = await this.applyVerifiedPixOrder(purchase, order);
    return toPublicPurchase(updated);
  }

  /**
   * Polling fallback for a lost/delayed webhook. Only PIX + PENDING.
   * Temporary Mercado Pago errors leave the local row unchanged.
   */
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

  /** Shared by webhook and GET reconciliation. Wallet increment is compare-and-swap on PENDING. */
  private async applyVerifiedPixOrder(
    purchase: CreditPurchase,
    order: PixVerifiedOrder,
  ): Promise<CreditPurchase> {
    if (order.status === 'PAID') {
      const expected = asMoney(purchase.amountPaid);
      if (order.amountBrl != null && Math.abs(order.amountBrl - expected) > 0.009) {
        this.logger.warn(`PIX amount mismatch for purchase ${purchase.id}`);
        return purchase;
      }
      const paid = await this.confirmPixPurchaseAtomic(
        purchase.id,
        buildProviderTxId('pix', order.orderId),
      );
      return paid ?? purchase;
    }

    if (
      order.status === 'FAILED' ||
      order.status === 'CANCELLED' ||
      order.status === 'REFUNDED'
    ) {
      return this.applyPixTerminalStatus(purchase, order);
    }

    return purchase;
  }

  private requireStoreProvider(raw: string): CanonicalPaymentProvider {
    const provider = normalizeProviderId(raw);
    if (provider === 'pix') {
      throw new BadRequestException('Provedor de pagamento inválido');
    }
    return provider;
  }

  private async findPixPurchase(order: PixVerifiedOrder) {
    const ids = [
      buildProviderTxId('pix', order.orderId),
      order.paymentId ? buildProviderTxId('pix', order.paymentId) : null,
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
      if (found && found.provider === 'pix') return found;
    }
    return null;
  }

  private async confirmPixPurchaseAtomic(
    purchaseId: string,
    providerTxId: string,
  ) {
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
        return tx.creditPurchase.findUnique({ where: { id: purchaseId } });
      }

      const paid = await tx.creditPurchase.findUnique({
        where: { id: purchaseId },
      });
      if (!paid) return null;

      await tx.creditWallet.upsert({
        where: { venueId: paid.venueId },
        create: { venueId: paid.venueId, balance: paid.credits },
        update: { balance: { increment: paid.credits } },
      });
      return paid;
    });
  }

  private async applyPixTerminalStatus(
    purchase: CreditPurchase,
    order: PixVerifiedOrder,
  ): Promise<CreditPurchase> {
    const next = order.status;
    if (purchase.status === 'PAID') {
      if (next !== 'REFUNDED') return purchase;
      return this.prisma.$transaction(async (tx) => {
        const claimed = await tx.creditPurchase.updateMany({
          where: { id: purchase.id, status: 'PAID' },
          data: { status: 'REFUNDED' },
        });
        if (claimed.count === 0) {
          return (
            (await tx.creditPurchase.findUnique({ where: { id: purchase.id } })) ??
            purchase
          );
        }
        await tx.creditWallet.upsert({
          where: { venueId: purchase.venueId },
          create: { venueId: purchase.venueId, balance: 0 },
          update: { balance: { increment: -purchase.credits } },
        });
        return (
          (await tx.creditPurchase.findUnique({ where: { id: purchase.id } })) ??
          purchase
        );
      });
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
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.creditPurchase.findUnique({
          where: { providerTxId: input.providerTxId },
        });
        if (existing) {
          if (existing.venueId !== input.venueId) {
            throw new BadRequestException('Esta compra já foi utilizada.');
          }
          return existing;
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
          },
        });

        await tx.creditWallet.upsert({
          where: { venueId: input.venueId },
          create: { venueId: input.venueId, balance: input.pack.credits },
          update: { balance: { increment: input.pack.credits } },
        });

        return purchase;
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
        if (again && again.venueId === input.venueId) return again;
        if (again) {
          throw new BadRequestException('Esta compra já foi utilizada.');
        }
      }
      throw error;
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
