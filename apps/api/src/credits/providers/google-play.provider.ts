import { createSign } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isProduction } from '../../common/env';
import {
  StorePaymentProvider,
  StoreVerifyInput,
  VerifiedPayment,
} from './payment-provider';

@Injectable()
export class GooglePlayPaymentProvider implements StorePaymentProvider {
  readonly id = 'google_play' as const;
  private readonly logger = new Logger(GooglePlayPaymentProvider.name);

  get isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim());
  }

  async verify(input: StoreVerifyInput): Promise<VerifiedPayment> {
    const packageName =
      process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'com.r2p.after.after_app';
    const accessToken = await this.googleAccessToken();
    if (!accessToken) {
      if (!isProduction()) {
        this.logger.warn(
          'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ausente — aceitando compra em desenvolvimento.',
        );
        return {
          provider: this.id,
          productId: input.productId,
          externalId: input.verificationData || input.purchaseId,
        };
      }
      throw new BadRequestException(
        'Verificação do Google Play não configurada no servidor.',
      );
    }

    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(input.productId)}` +
      `/tokens/${encodeURIComponent(input.verificationData)}`;
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
        payload.error?.message ??
          'Não foi possível validar a compra no Google Play.',
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

    return {
      provider: this.id,
      productId: input.productId,
      externalId: payload.orderId || input.verificationData || input.purchaseId,
    };
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
