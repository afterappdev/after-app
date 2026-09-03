import { AdminPushEventType, PurchaseStatus, Role } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AdminPushService } from './admin-push.service';
import {
  FirebaseMessagingPort,
  AdminPushSendResult,
} from './firebase-messaging.port';
import {
  accountCreatedCopy,
  formatBrl,
  isRealPaidSale,
  providerLabel,
  purchasePaidCopy,
} from './admin-push.copy';

function purchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    venueId: 'venue-1',
    packageKey: 'combo_5',
    productId: null,
    amountPaid: new Prisma.Decimal('115.00'),
    currency: 'BRL',
    credits: 5,
    provider: 'pix',
    providerTxId: 'pix:ORD1',
    status: PurchaseStatus.PAID,
    confirmedAt: new Date('2026-09-03T11:00:00.000Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

class FakeMessaging implements FirebaseMessagingPort {
  configured = true;
  calls: Array<{
    tokens: string[];
    title: string;
    body: string;
    data: Record<string, string>;
  }> = [];
  results:
    AdminPushSendResult[] | ((tokens: string[]) => AdminPushSendResult[]) = [];

  sendToTokens(
    tokens: string[],
    message: { title: string; body: string; data: Record<string, string> },
  ): Promise<AdminPushSendResult[]> {
    this.calls.push({ tokens, ...message });
    if (typeof this.results === 'function') {
      return Promise.resolve(this.results(tokens));
    }
    if (this.results.length) return Promise.resolve(this.results);
    return Promise.resolve(
      tokens.map((token) => ({ token, success: true, invalid: false })),
    );
  }
}

function createPrisma() {
  const events = new Map<
    string,
    { id: string; type: string; entityId: string }
  >();
  const tokens = [
    { token: 'fcm-android-token-1' },
    { token: 'fcm-ios-token-2xxxx' },
  ];
  const prisma = {
    adminPushEvent: {
      create: jest.fn(
        ({ data }: { data: { type: string; entityId: string } }) => {
          const key = `${data.type}:${data.entityId}`;
          if (events.has(key)) {
            return Promise.reject(
              Object.assign(new Error('unique'), { code: 'P2002' }),
            );
          }
          const row = { id: `evt-${events.size + 1}`, ...data };
          events.set(key, row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(() => Promise.resolve({})),
    },
    adminDeviceToken: {
      findMany: jest.fn(() => Promise.resolve(tokens)),
      deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
  };
  return { prisma, events, tokens };
}

describe('Admin push copy', () => {
  it('traduz providers visíveis', () => {
    expect(providerLabel('google_play')).toBe('Google Play');
    expect(providerLabel('app_store')).toBe('Apple');
    expect(providerLabel('pix')).toBe('PIX');
  });

  it('formata BRL sem perder centavos', () => {
    expect(formatBrl(115)).toMatch(/R\$\s*115,00/);
    expect(formatBrl(new Prisma.Decimal('200.00'))).toMatch(/R\$\s*200,00/);
  });

  it('monta mensagem de venda real', () => {
    expect(
      purchasePaidCopy({ credits: 5, amountPaid: 115, provider: 'pix' }).body,
    ).toMatch(/5 créditos vendidos por R\$\s*115,00 via PIX\./);
    expect(
      purchasePaidCopy({ credits: 1, amountPaid: 25, provider: 'google_play' })
        .body,
    ).toMatch(/1 crédito vendido por R\$\s*25,00 via Google Play\./);
    expect(
      purchasePaidCopy({ credits: 10, amountPaid: 200, provider: 'app_store' })
        .body,
    ).toMatch(/10 créditos vendidos por R\$\s*200,00 via Apple\./);
  });

  it('welcome/stub/PENDING não são venda real', () => {
    expect(isRealPaidSale(purchase({ packageKey: 'welcome' }))).toBe(false);
    expect(isRealPaidSale(purchase({ provider: 'stub' }))).toBe(false);
    expect(
      isRealPaidSale(
        purchase({ status: PurchaseStatus.PENDING, confirmedAt: null }),
      ),
    ).toBe(false);
  });
});

describe('AdminPushService', () => {
  let prisma: ReturnType<typeof createPrisma>['prisma'];
  let messaging: FakeMessaging;
  let service: AdminPushService;

  beforeEach(() => {
    ({ prisma } = createPrisma());
    messaging = new FakeMessaging();
    service = new AdminPushService(prisma as never, messaging);
  });

  it('ACCOUNT_CREATED é idempotente', async () => {
    const user = {
      id: 'user-1',
      name: 'João Silva',
      role: Role.USER,
      venue: null,
    };
    await service.notifyConsumerAccountCreated(user);
    await service.notifyConsumerAccountCreated(user);
    expect(prisma.adminPushEvent.create).toHaveBeenCalledTimes(2);
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].title).toBe('Nova conta no After');
    expect(messaging.calls[0].data.type).toBe(
      AdminPushEventType.ACCOUNT_CREATED,
    );
    expect(messaging.calls[0].data.entityId).toBe('user-1');
  });

  it('VENUE_CREATED é idempotente e gera dois eventos na primeira vez', async () => {
    const user = {
      id: 'user-2',
      name: 'Maria',
      role: Role.VENUE,
      venue: { id: 'venue-9', name: 'Bar Central' },
    };
    await service.notifyConsumerAccountCreated(user);
    await service.notifyConsumerAccountCreated(user);
    expect(prisma.adminPushEvent.create).toHaveBeenCalledTimes(4);
    expect(messaging.calls).toHaveLength(2);
    expect(messaging.calls.map((item) => item.data.type)).toEqual([
      'ACCOUNT_CREATED',
      'VENUE_CREATED',
    ]);
    expect(accountCreatedCopy(Role.VENUE, 'Maria').body).toContain(
      'conta de estabelecimento',
    );
  });

  it('PURCHASE_PAID é idempotente', async () => {
    const sale = purchase();
    await service.notifyPurchasePaid(sale);
    await service.notifyPurchasePaid(sale);
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].data.type).toBe('PURCHASE_PAID');
    expect(messaging.calls[0].data.entityId).toBe('sale-1');
    expect(messaging.calls[0].body).toContain('PIX');
    expect(messaging.calls[0].body).not.toContain('google_play');
  });

  it('welcome não envia push de venda', async () => {
    await service.notifyPurchasePaid(purchase({ packageKey: 'welcome' }));
    expect(prisma.adminPushEvent.create).not.toHaveBeenCalled();
    expect(messaging.calls).toHaveLength(0);
  });

  it('stub não envia push', async () => {
    await service.notifyPurchasePaid(purchase({ provider: 'stub' }));
    expect(messaging.calls).toHaveLength(0);
  });

  it('PENDING não envia push', async () => {
    await service.notifyPurchasePaid(
      purchase({ status: PurchaseStatus.PENDING, confirmedAt: null }),
    );
    expect(messaging.calls).toHaveLength(0);
  });

  it('token inválido é removido sem impedir os demais', async () => {
    messaging.results = (tokens) =>
      tokens.map((token, index) => ({
        token,
        success: index === 1,
        invalid: index === 0,
      }));
    await service.notifyPurchasePaid(purchase());
    expect(prisma.adminDeviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['fcm-android-token-1'] } },
    });
    expect(messaging.calls[0].tokens).toHaveLength(2);
  });

  it('ADMIN não gera ACCOUNT_CREATED', async () => {
    await service.notifyConsumerAccountCreated({
      id: 'admin-1',
      name: 'Admin',
      role: Role.ADMIN,
      venue: null,
    });
    expect(prisma.adminPushEvent.create).not.toHaveBeenCalled();
  });
});
