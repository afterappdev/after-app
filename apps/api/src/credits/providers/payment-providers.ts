import { BadRequestException, Injectable } from '@nestjs/common';
import { AppleAppStorePaymentProvider } from './apple-app-store.provider';
import { GooglePlayPaymentProvider } from './google-play.provider';
import {
  CanonicalPaymentProvider,
  StorePaymentProvider,
  normalizeProviderId,
} from './payment-provider';
import { PixPaymentProvider } from './pix.provider';

@Injectable()
export class PaymentProviderRegistry {
  constructor(
    private readonly googlePlay: GooglePlayPaymentProvider,
    private readonly appleAppStore: AppleAppStorePaymentProvider,
    private readonly pix: PixPaymentProvider,
  ) {}

  storeProvider(raw: string): StorePaymentProvider {
    const id = normalizeProviderId(raw);
    if (id === 'google_play') return this.googlePlay;
    if (id === 'app_store') return this.appleAppStore;
    throw new BadRequestException('Provedor de pagamento inválido');
  }

  pixProvider(): PixPaymentProvider {
    return this.pix;
  }

  canonicalId(raw: string): CanonicalPaymentProvider {
    return normalizeProviderId(raw);
  }
}
