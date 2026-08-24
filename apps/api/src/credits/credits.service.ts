import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CREDIT_PACKAGES, CreditPackageKey } from '../common/constants/credits';
import { PrismaService } from '../prisma/prisma.service';
import { verifyStorePurchase } from './store-billing';

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.creditPurchase.findMany({
      where: { venueId: venue.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Checkout stub — creates a PENDING purchase.
   * Real payment gateway webhook will mark PAID and credit the wallet.
   */
  async checkout(userId: string, packageKey: CreditPackageKey) {
    const pack = CREDIT_PACKAGES.find((p) => p.key === packageKey);
    if (!pack) {
      throw new BadRequestException('Pacote inválido');
    }

    const venue = await this.requireVenueOwned(userId);

    const purchase = await this.prisma.creditPurchase.create({
      data: {
        venueId: venue.id,
        packageKey: pack.key,
        amountPaid: pack.priceBrl,
        credits: pack.credits,
        status: 'PENDING',
        providerTxId: `stub_${Date.now()}`,
      },
    });

    return {
      purchase,
      checkoutUrl: null,
      message:
        'Checkout stub: use POST /credits/dev-confirm/:purchaseId para simular pagamento em desenvolvimento.',
    };
  }

  /** Dev-only helper to simulate payment confirmation. */
  async confirmPurchaseDev(userId: string, purchaseId: string) {
    const venue = await this.requireVenueOwned(userId);
    const purchase = await this.prisma.creditPurchase.findUnique({
      where: { id: purchaseId },
    });
    if (!purchase || purchase.venueId !== venue.id) {
      throw new NotFoundException('Compra não encontrada');
    }
    if (purchase.status === 'PAID') {
      return purchase;
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.creditWallet.upsert({
        where: { venueId: venue.id },
        create: { venueId: venue.id, balance: purchase.credits },
        update: { balance: { increment: purchase.credits } },
      }),
      this.prisma.creditPurchase.update({
        where: { id: purchaseId },
        data: { status: 'PAID' },
      }),
    ]);

    return updated;
  }

  async confirmStorePurchase(
    userId: string,
    dto: {
      packageKey: CreditPackageKey;
      productId: string;
      provider: 'google_play' | 'app_store';
      purchaseId: string;
      verificationData: string;
    },
  ) {
    const pack = CREDIT_PACKAGES.find((item) => item.storeProductId === dto.productId);
    if (!pack) {
      throw new BadRequestException('Produto da loja inválido');
    }
    if (pack.key !== dto.packageKey) {
      throw new BadRequestException('Pacote não confere com o produto da loja');
    }

    const verified = await verifyStorePurchase({
      provider: dto.provider,
      productId: dto.productId,
      purchaseId: dto.purchaseId,
      verificationData: dto.verificationData,
    });
    const providerTxId = `${dto.provider}:${verified.orderId || dto.purchaseId || dto.verificationData}`;
    const venue = await this.requireVenueOwned(userId);

    const existing = await this.prisma.creditPurchase.findFirst({
      where: { providerTxId },
    });
    if (existing) {
      if (existing.venueId !== venue.id) {
        throw new BadRequestException('Esta compra já foi utilizada.');
      }
      return existing;
    }

    try {
      const [purchase] = await this.prisma.$transaction([
        this.prisma.creditPurchase.create({
          data: {
            venueId: venue.id,
            packageKey: pack.key,
            amountPaid: pack.priceBrl,
            credits: pack.credits,
            status: 'PAID',
            providerTxId,
          },
        }),
        this.prisma.creditWallet.upsert({
          where: { venueId: venue.id },
          create: { venueId: venue.id, balance: pack.credits },
          update: { balance: { increment: pack.credits } },
        }),
      ]);
      return purchase;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        const again = await this.prisma.creditPurchase.findFirst({
          where: { providerTxId },
        });
        if (again && again.venueId === venue.id) return again;
      }
      throw error;
    }
  }

  private async requireVenueOwned(userId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { ownerUserId: userId },
    });
    if (!venue) {
      throw new ForbiddenException('Conta não é de estabelecimento');
    }
    return venue;
  }
}
