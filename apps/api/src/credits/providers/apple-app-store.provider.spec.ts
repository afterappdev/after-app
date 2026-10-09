import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Environment,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
import { AppleAppStorePaymentProvider } from './apple-app-store.provider';
import { createTestAppleChain } from './apple-storekit-test-jws';
import { StoreVerifyInput } from './payment-provider';

const BUNDLE_ID = 'com.r2p.after.afterApp';
const PRODUCT_ID = 'after.credits.1';
const TRANSACTION_ID = '2000000123';

function input(overrides: Partial<StoreVerifyInput> = {}): StoreVerifyInput {
  return {
    productId: PRODUCT_ID,
    purchaseId: TRANSACTION_ID,
    verificationData: 'unused',
    ...overrides,
  };
}

describe('AppleAppStorePaymentProvider', () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    APPLE_SHARED_SECRET: process.env.APPLE_SHARED_SECRET,
    APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID,
    APPLE_APP_APPLE_ID: process.env.APPLE_APP_APPLE_ID,
  };
  const chain = createTestAppleChain();

  function provider() {
    return AppleAppStorePaymentProvider.forTests({
      rootCertificates: [chain.rootDer],
      enableOnlineChecks: false,
    });
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.APPLE_BUNDLE_ID = BUNDLE_ID;
    process.env.APPLE_SHARED_SECRET = 'shared-secret';
    delete process.env.APPLE_APP_APPLE_ID;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    restore('APPLE_SHARED_SECRET', originalEnv.APPLE_SHARED_SECRET);
    restore('APPLE_BUNDLE_ID', originalEnv.APPLE_BUNDLE_ID);
    restore('APPLE_APP_APPLE_ID', originalEnv.APPLE_APP_APPLE_ID);
  });

  it('aceita transação consumível assinada no Sandbox', async () => {
    const signed = chain.sign({ environment: 'Sandbox' });
    const verified = await provider().verify(
      input({ verificationData: signed }),
    );
    expect(verified).toEqual({
      provider: 'app_store',
      productId: PRODUCT_ID,
      externalId: TRANSACTION_ID,
    });
  });

  it('aceita transação consumível assinada em Production', async () => {
    process.env.APPLE_APP_APPLE_ID = '1234567890';
    const signed = chain.sign({
      environment: 'Production',
      transactionId: '3000000456',
      originalTransactionId: '3000000456',
      productId: 'after.credits.5',
    });
    const verified = await provider().verify(
      input({
        productId: 'after.credits.5',
        purchaseId: '3000000456',
        verificationData: signed,
      }),
    );
    expect(verified.externalId).toBe('3000000456');
    expect(verified.productId).toBe('after.credits.5');
  });

  it('rejeita recibo PKCS#7 malformado sem tratar o corpo como JWS', async () => {
    const receiptRequest = jest.fn().mockResolvedValue({ status: 21002 });
    const apple = AppleAppStorePaymentProvider.forTests({
      rootCertificates: [chain.rootDer],
      enableOnlineChecks: false,
      receiptRequest,
    });
    await expect(
      apple.verify(input({ verificationData: 'MIIlegacy-receipt-not-a-jws' })),
    ).rejects.toThrow('Recibo Apple inválido (status 21002)');
    expect(receiptRequest).toHaveBeenCalledTimes(1);
    expect(receiptRequest.mock.calls[0][0]).toBe('MIIlegacy-receipt-not-a-jws');
    expect(receiptRequest.mock.calls[0][2]).toBe(false);
  });

  it('rejeita JWS com assinatura inválida e não consulta verifyReceipt', async () => {
    const receiptRequest = jest.fn();
    const apple = AppleAppStorePaymentProvider.forTests({
      rootCertificates: [chain.rootDer],
      enableOnlineChecks: false,
      receiptRequest,
    });
    const signed = chain.sign();
    const [header, payload, signature] = signed.split('.');
    const broken = `${header}.${payload}.${signature.slice(0, -4)}AAAA`;
    await expect(
      apple.verify(input({ verificationData: broken })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(receiptRequest).not.toHaveBeenCalled();
  });

  it('rejeita JWS válido de outro produto, bundle, tipo ou transação', async () => {
    const apple = provider();
    await expect(
      apple.verify(
        input({
          verificationData: chain.sign({ productId: 'after.credits.10' }),
        }),
      ),
    ).rejects.toThrow('Transação Apple não corresponde ao produto solicitado.');
    await expect(
      apple.verify(
        input({
          verificationData: chain.sign({ bundleId: 'com.other.app' }),
        }),
      ),
    ).rejects.toThrow('Recibo Apple não pertence a este app.');
    await expect(
      apple.verify(
        input({
          verificationData: chain.sign({ type: 'Non-Consumable' }),
        }),
      ),
    ).rejects.toThrow('A transação Apple não é um produto consumível.');
    await expect(
      apple.verify(
        input({
          purchaseId: '999',
          verificationData: chain.sign(),
        }),
      ),
    ).rejects.toThrow('Transação Apple não corresponde à compra enviada.');
  });

  it('rejeita transação revogada e ambiente que não é Sandbox nem Production', async () => {
    const apple = provider();
    await expect(
      apple.verify(
        input({
          verificationData: chain.sign({ revocationDate: 1_700_000_100_000 }),
        }),
      ),
    ).rejects.toThrow('A transação Apple foi revogada.');
    await expect(
      apple.verify(
        input({
          verificationData: chain.sign({ environment: 'Xcode' }),
        }),
      ),
    ).rejects.toThrow('Transação Apple inválida.');
  });

  it('rejeita cadeia que não pertence à Apple', async () => {
    const apple = new AppleAppStorePaymentProvider();
    await expect(
      apple.verify(input({ verificationData: chain.sign() })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('trata falha retryable da verificação assinada como recuperável', async () => {
    const apple = AppleAppStorePaymentProvider.forTests({
      enableOnlineChecks: false,
      verifierFor: () => ({
        verifyAndDecodeTransaction: () => {
          throw new VerificationException(
            VerificationStatus.RETRYABLE_VERIFICATION_FAILURE,
          );
        },
      }),
    });
    await expect(
      apple.verify(input({ verificationData: chain.sign() })),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('valida recibo legado de Production e repete no Sandbox após 21007', async () => {
    const receiptRequest = jest
      .fn()
      .mockResolvedValueOnce({ status: 21007 })
      .mockResolvedValueOnce(legacyReceipt('Sandbox'));
    const apple = AppleAppStorePaymentProvider.forTests({ receiptRequest });
    const verified = await apple.verify(
      input({ verificationData: 'MIIsandbox-receipt' }),
    );
    expect(verified.externalId).toBe(TRANSACTION_ID);
    expect(receiptRequest.mock.calls.map((call) => call[2])).toEqual([
      false,
      true,
    ]);
  });

  it('valida recibo legado pago diretamente em Production', async () => {
    const receiptRequest = jest.fn().mockResolvedValue(legacyReceipt('Production'));
    const apple = AppleAppStorePaymentProvider.forTests({ receiptRequest });
    const verified = await apple.verify(
      input({ verificationData: 'MIIproduction-receipt' }),
    );
    expect(verified.externalId).toBe(TRANSACTION_ID);
    expect(receiptRequest).toHaveBeenCalledTimes(1);
    expect(receiptRequest.mock.calls[0][2]).toBe(false);
  });

  it('trata indisponibilidade do verifyReceipt como recuperável', async () => {
    const down = AppleAppStorePaymentProvider.forTests({
      receiptRequest: jest.fn().mockResolvedValue({ status: 21005 }),
    });
    await expect(
      down.verify(input({ verificationData: 'MIItemporary' })),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const network = AppleAppStorePaymentProvider.forTests({
      receiptRequest: jest.fn().mockRejectedValue(new Error('ECONNRESET')),
    });
    await expect(
      network.verify(input({ verificationData: 'MIInetwork' })),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('exige APPLE_APP_APPLE_ID para JWS de Production', async () => {
    delete process.env.APPLE_APP_APPLE_ID;
    await expect(
      provider().verify(
        input({
          verificationData: chain.sign({ environment: Environment.PRODUCTION }),
        }),
      ),
    ).rejects.toThrow(
      'Verificação da App Store em produção não configurada no servidor.',
    );
  });
});

function legacyReceipt(environment: string) {
  return {
    status: 0,
    environment,
    receipt: {
      bundle_id: BUNDLE_ID,
      in_app: [
        {
          product_id: PRODUCT_ID,
          transaction_id: TRANSACTION_ID,
        },
      ],
    },
  };
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
