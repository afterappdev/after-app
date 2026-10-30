import { BadRequestException } from '@nestjs/common';
import { GooglePlayPaymentProvider } from './google-play.provider';
import { StoreVerifyInput } from './payment-provider';

const PRODUCT = 'after.credits.vip.1';
const TOKEN = 'purchase-token-abc';

function input(overrides: Partial<StoreVerifyInput> = {}): StoreVerifyInput {
  return {
    productId: PRODUCT,
    purchaseId: 'gp-1',
    verificationData: TOKEN,
    ...overrides,
  };
}

describe('GooglePlayPaymentProvider', () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    GOOGLE_PLAY_PACKAGE_NAME: process.env.GOOGLE_PLAY_PACKAGE_NAME,
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
  };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.r2p.after.after_app';
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.GOOGLE_PLAY_PACKAGE_NAME === undefined) {
      delete process.env.GOOGLE_PLAY_PACKAGE_NAME;
    } else {
      process.env.GOOGLE_PLAY_PACKAGE_NAME =
        originalEnv.GOOGLE_PLAY_PACKAGE_NAME;
    }
    if (originalEnv.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON === undefined) {
      delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    } else {
      process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON =
        originalEnv.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    }
  });

  function provider() {
    return GooglePlayPaymentProvider.forTests({ accessToken: 'test-bearer' });
  }

  function mockGetPurchase(payload: Record<string, unknown>, ok = true) {
    fetchMock.mockResolvedValueOnce({
      ok,
      json: async () => payload,
    });
  }

  it('verify não chama :consume — apenas GET da compra', async () => {
    mockGetPurchase({
      purchaseState: 0,
      consumptionState: 0,
      orderId: 'GPA.123',
    });
    const verified = await provider().verify(input());
    expect(verified.googlePlayPendingConsume).toBe(true);
    expect(verified.externalId).toBe('GPA.123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(':consume');
  });

  it('verify marca consume desnecessário quando já consumido', async () => {
    mockGetPurchase({
      purchaseState: 0,
      consumptionState: 1,
      orderId: 'GPA.done',
    });
    const verified = await provider().verify(input());
    expect(verified.googlePlayPendingConsume).toBe(false);
  });

  it('rejeita compra pendente e cancelada', async () => {
    mockGetPurchase({ purchaseState: 1, consumptionState: 0 });
    await expect(provider().verify(input())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    mockGetPurchase({ purchaseState: 2, consumptionState: 0 });
    await expect(provider().verify(input())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejeita GET com erro HTTP da Google', async () => {
    mockGetPurchase({ error: { message: 'Invalid token' } }, false);
    await expect(provider().verify(input())).rejects.toThrow('Invalid token');
  });

  it('em produção sem credenciais não credita (verify falha)', async () => {
    const bare = new GooglePlayPaymentProvider();
    await expect(bare.verify(input())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('finalizeVerifiedPurchase consome com sucesso', async () => {
    mockGetPurchase({
      purchaseState: 0,
      consumptionState: 0,
      orderId: 'GPA.c',
    });
    const gp = provider();
    const verified = await gp.verify(input());
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await gp.finalizeVerifiedPurchase(input(), verified);
    expect(String(fetchMock.mock.calls[1][0])).toContain(':consume');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
  });

  it('finalizeVerifiedPurchase propaga erro HTTP do consume', async () => {
    const verified = {
      provider: 'google_play' as const,
      productId: PRODUCT,
      externalId: 'GPA.x',
      googlePlayPendingConsume: true,
    };
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Consume failed' } }),
    });
    await expect(
      provider().finalizeVerifiedPurchase(input(), verified),
    ).rejects.toThrow('Consume failed');
  });

  it('finalize ignorado quando compra já estava consumida', async () => {
    const verified = {
      provider: 'google_play' as const,
      productId: PRODUCT,
      externalId: 'GPA.y',
      googlePlayPendingConsume: false,
    };
    await provider().finalizeVerifiedPurchase(input(), verified);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
