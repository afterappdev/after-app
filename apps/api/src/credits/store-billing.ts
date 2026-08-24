import { createSign } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { BadRequestException, Logger } from '@nestjs/common';

const logger = new Logger('StoreBilling');

type StoreProvider = 'google_play' | 'app_store';

export async function verifyStorePurchase(input: {
  provider: StoreProvider;
  productId: string;
  purchaseId: string;
  verificationData: string;
}): Promise<{ orderId: string }> {
  if (input.provider === 'google_play') {
    return verifyGooglePlay(input.productId, input.verificationData);
  }
  return verifyApple(input.productId, input.purchaseId, input.verificationData);
}

function allowUnverifiedDev(): boolean {
  return (process.env.NODE_ENV ?? 'development') !== 'production';
}

async function verifyGooglePlay(productId: string, purchaseToken: string) {
  const packageName =
    process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'com.r2p.after.after_app';
  const accessToken = await googleAccessToken();
  if (!accessToken) {
    if (allowUnverifiedDev()) {
      logger.warn(
        'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ausente — aceitando compra em desenvolvimento.',
      );
      return { orderId: purchaseToken };
    }
    throw new BadRequestException(
      'Verificação do Google Play não configurada no servidor.',
    );
  }

  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}` +
    `/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await res.json()) as {
    error?: { message?: string };
    purchaseState?: number;
    consumptionState?: number;
    orderId?: string;
  };
  if (!res.ok) {
    throw new BadRequestException(
      payload.error?.message ?? 'Não foi possível validar a compra no Google Play.',
    );
  }
  if (payload.purchaseState !== 0) {
    throw new BadRequestException('Compra do Google Play não está paga.');
  }

  if (payload.consumptionState !== 1) {
    await fetch(`${url}:consume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  return { orderId: payload.orderId || purchaseToken };
}

async function verifyApple(
  productId: string,
  purchaseId: string,
  receipt: string,
) {
  const secret = process.env.APPLE_SHARED_SECRET?.trim();
  if (!secret) {
    if (allowUnverifiedDev()) {
      logger.warn(
        'APPLE_SHARED_SECRET ausente — aceitando compra em desenvolvimento.',
      );
      return { orderId: purchaseId || receipt.slice(0, 64) };
    }
    throw new BadRequestException(
      'Verificação da App Store não configurada no servidor.',
    );
  }

  const payload = await appleVerifyReceipt(receipt, secret, false);
  const status = payload.status as number | undefined;
  const body =
    status === 21007 ? await appleVerifyReceipt(receipt, secret, true) : payload;
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
    ...(((body.latest_receipt_info as Array<Record<string, string>>) ?? [])),
    ...((((body.receipt as { in_app?: Array<Record<string, string>> })?.in_app) ??
      [])),
  ];
  const match = items.find((item) => {
    const pid = item.product_id;
    const tid = item.transaction_id || item.original_transaction_id;
    return pid === productId && (!purchaseId || tid === purchaseId);
  });
  if (!match) {
    throw new BadRequestException('Transação Apple não encontrada no recibo.');
  }
  return {
    orderId: match.transaction_id || purchaseId,
  };
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

async function googleAccessToken(): Promise<string | null> {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  let jsonText = raw;
  if (existsSync(raw)) {
    jsonText = readFileSync(raw, 'utf8');
  }
  const sa = JSON.parse(jsonText) as {
    client_email?: string;
    private_key?: string;
  };
  if (!sa.client_email || !sa.private_key) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const payload = (await res.json()) as { access_token?: string };
  return payload.access_token ?? null;
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}
