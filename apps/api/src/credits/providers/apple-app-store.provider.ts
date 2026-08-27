import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isProduction } from '../../common/env';
import {
  StorePaymentProvider,
  StoreVerifyInput,
  VerifiedPayment,
} from './payment-provider';

@Injectable()
export class AppleAppStorePaymentProvider implements StorePaymentProvider {
  readonly id = 'app_store' as const;
  private readonly logger = new Logger(AppleAppStorePaymentProvider.name);

  get isConfigured(): boolean {
    return Boolean(process.env.APPLE_SHARED_SECRET?.trim());
  }

  async verify(input: StoreVerifyInput): Promise<VerifiedPayment> {
    const secret = process.env.APPLE_SHARED_SECRET?.trim();
    if (!secret) {
      if (!isProduction()) {
        this.logger.warn(
          'APPLE_SHARED_SECRET ausente — aceitando compra em desenvolvimento.',
        );
        return {
          provider: this.id,
          productId: input.productId,
          externalId: input.purchaseId || input.verificationData.slice(0, 64),
        };
      }
      throw new BadRequestException(
        'Verificação da App Store não configurada no servidor.',
      );
    }

    const payload = await appleVerifyReceipt(input.verificationData, secret, false);
    const status = payload.status as number | undefined;
    const body =
      status === 21007
        ? await appleVerifyReceipt(input.verificationData, secret, true)
        : payload;
    if (body.status !== 0) {
      throw new BadRequestException(
        `Recibo Apple inválido (status ${body.status ?? 'desconhecido'}).`,
      );
    }

    const bundleId = process.env.APPLE_BUNDLE_ID ?? 'com.r2p.after.afterApp';
    const receiptBundle = (body.receipt as { bundle_id?: string } | undefined)
      ?.bundle_id;
    if (receiptBundle && receiptBundle !== bundleId) {
      throw new BadRequestException('Recibo Apple não pertence a este app.');
    }

    const items = [
      ...((body.latest_receipt_info as Array<Record<string, string>>) ?? []),
      ...(((body.receipt as { in_app?: Array<Record<string, string>> })?.in_app) ??
        []),
    ];
    const match = items.find((item) => {
      const pid = item.product_id;
      const tid = item.transaction_id || item.original_transaction_id;
      return (
        pid === input.productId &&
        (!input.purchaseId || tid === input.purchaseId)
      );
    });
    if (!match) {
      throw new BadRequestException('Transação Apple não encontrada no recibo.');
    }
    return {
      provider: this.id,
      productId: input.productId,
      externalId: match.transaction_id || input.purchaseId,
    };
  }
}

async function appleVerifyReceipt(
  receiptData: string,
  password: string,
  sandbox: boolean,
) {
  const host = sandbox
    ? 'https://sandbox.itunes.apple.com/verifyReceipt'
    : 'https://buy.itunes.apple.com/verifyReceipt';
  const res = await fetch(host, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      password,
      'exclude-old-transactions': true,
    }),
  });
  return (await res.json()) as Record<string, unknown>;
}
