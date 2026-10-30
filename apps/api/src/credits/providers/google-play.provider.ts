import { createSign } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isProduction } from '../../common/env';
import {
  StorePaymentProvider,
  StoreVerifyInput,
  VerifiedPayment,
} from './payment-provider';

type GooglePurchasePayload = {
  error?: { message?: string };
  purchaseState?: number;
  consumptionState?: number;
  orderId?: string;
};

@Injectable()
export class GooglePlayPaymentProvider implements StorePaymentProvider {
  readonly id = 'google_play' as const;
  private readonly logger = new Logger(GooglePlayPaymentProvider.name);
  private accessTokenResolver: () => Promise<string | null> =
    this.googleAccessToken.bind(this);

  get isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim());
  }

  /** Test hook: skip OAuth and inject a bearer token for mocked fetch. */
  static forTests(options: { accessToken: string | null }): GooglePlayPaymentProvider {
    const provider = new GooglePlayPaymentProvider();
    provider.accessTokenResolver = async () => options.accessToken;
    return provider;
  }

  async verify(input: StoreVerifyInput): Promise<VerifiedPayment> {
    const token = (input.verificationData ?? '').trim();
    if (!token) {
      throw new BadRequestException('Token de compra do Google Play inválido.');
    }

    const accessToken = await this.accessTokenResolver();
    if (!accessToken) {
      if (!isProduction()) {
        this.logger.warn(
          'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ausente — aceitando compra em desenvolvimento.',
        );
        return {
          provider: this.id,
          productId: input.productId,
          externalId: input.purchaseId?.trim() || token,
          googlePlayPendingConsume: false,
        };
      }
      throw new BadRequestException(
        'Verificação do Google Play não configurada no servidor.',
      );
    }

    const payload = await this.fetchPurchase(input.productId, token, accessToken);
    this.assertPurchasePaid(payload);

    return {
      provider: this.id,
      productId: input.productId,
      externalId: payload.orderId?.trim() || token,
      googlePlayPendingConsume: payload.consumptionState !== 1,
    };
  }

  async finalizeVerifiedPurchase(
    input: StoreVerifyInput,
    verified: VerifiedPayment,
  ): Promise<void> {
    if (!verified.googlePlayPendingConsume) return;

    const token = (input.verificationData ?? '').trim();
    if (!token) {
      throw new BadRequestException('Token de compra do Google Play inválido.');
    }

    const accessToken = await this.accessTokenResolver();
    if (!accessToken) {
      if (!isProduction()) {
        this.logger.warn(
          'Google Play consume ignorado em desenvolvimento (sem credenciais).',
        );
        return;
      }
      throw new BadRequestException(
        'Verificação do Google Play não configurada no servidor.',
      );
    }

    const url = this.purchaseUrl(input.productId, token);
    const res = await fetch(`${url}:consume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return;

    let message = 'Não foi possível consumir a compra no Google Play.';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // ignore JSON parse errors
    }
    throw new BadRequestException(message);
  }

  private purchaseUrl(productId: string, purchaseToken: string): string {
    const packageName =
      process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'com.r2p.after.after_app';
    return (
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}` +
      `/tokens/${encodeURIComponent(purchaseToken)}`
    );
  }

  private async fetchPurchase(
    productId: string,
    purchaseToken: string,
    accessToken: string,
  ): Promise<GooglePurchasePayload> {
    const url = this.purchaseUrl(productId, purchaseToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await res.json()) as GooglePurchasePayload;
    if (!res.ok) {
      throw new BadRequestException(
        payload.error?.message ??
          'Não foi possível validar a compra no Google Play.',
      );
    }
    return payload;
  }

  private assertPurchasePaid(payload: GooglePurchasePayload): void {
    if (payload.purchaseState === 0) return;
    if (payload.purchaseState === 1) {
      throw new BadRequestException('Compra do Google Play ainda está pendente.');
    }
    if (payload.purchaseState === 2) {
      throw new BadRequestException('Compra do Google Play foi cancelada.');
    }
    throw new BadRequestException('Compra do Google Play não está paga.');
  }

  private async googleAccessToken(): Promise<string | null> {
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
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}
