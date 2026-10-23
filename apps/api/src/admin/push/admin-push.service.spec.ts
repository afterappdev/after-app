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
  reportCreatedCopy,
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
    userDeviceToken: {
      findMany: jest.fn(() => Promise.resolve([{ token: 'consumer-token' }])),
    },
    venue: {
      findUnique: jest.fn(() =>
        Promise.resolve({ name: 'Refúgio do Chef' }),
      ),
    },
  };
  return { prisma, events, tokens };
}

describe('Admin push copy', () => {
  it('traduz providers visíveis', () => {
    expect(providerLabel('google_play')).toBe('Google Play');
    expect(providerLabel('app_store')).toBe('Apple');
    expect(providerLabel('pix')).toBe('PIX');
    expect(providerLabel('card')).toBe('Cartão de crédito');
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
    const card = purchasePaidCopy({
      credits: 1,
      amountPaid: '34.90',
      provider: 'card',
      venueName: 'Bar Central',
    });
    expect(card.title).toBe('Nova compra de créditos 💳');
    expect(card.body).toMatch(
      /^Bar Central comprou 1 crédito por R\$\s*34,90 via cartão de crédito\.$/,
    );
  });

  it('inclui o nome do local nas vendas Google Play, Apple e PIX', () => {
    expect(
      purchasePaidCopy({
        credits: 10,
        amountPaid: 200,
        provider: 'google_play',
        venueName: 'Refúgio do Chef',
      }),
    ).toEqual({
      title: 'Nova venda no After',
      body: expect.stringMatching(
        /^Refúgio do Chef — 10 créditos vendidos por R\$\s*200,00 via Google Play\.$/,
      ),
    });
    expect(
      purchasePaidCopy({
        credits: 10,
        amountPaid: 200,
        provider: 'app_store',
        venueName: 'Refúgio do Chef',
      }).body,
    ).toMatch(
      /^Refúgio do Chef — 10 créditos vendidos por R\$\s*200,00 via Apple\.$/,
    );
    expect(
      purchasePaidCopy({
        credits: 10,
        amountPaid: 200,
        provider: 'pix',
        venueName: 'Refúgio do Chef',
      }).body,
    ).toMatch(
      /^Refúgio do Chef — 10 créditos vendidos por R\$\s*200,00 via PIX\.$/,
    );
  });

  it('fallback sem nome do local usa o texto antigo', () => {
    const fallback = purchasePaidCopy({
      credits: 10,
      amountPaid: 200,
      provider: 'google_play',
    });
    expect(fallback.title).toBe('Nova venda no After');
    expect(fallback.body).toMatch(
      /^10 créditos vendidos por R\$\s*200,00 via Google Play\.$/,
    );
    expect(
      purchasePaidCopy({
        credits: 10,
        amountPaid: 200,
        provider: 'pix',
        venueName: '   ',
      }).body,
    ).toMatch(/^10 créditos vendidos por R\$\s*200,00 via PIX\.$/);
  });

  it('welcome/stub/PENDING não são venda real', () => {
    expect(isRealPaidSale(purchase({ packageKey: 'welcome' }))).toBe(false);
    expect(isRealPaidSale(purchase({ provider: 'stub' }))).toBe(false);
    expect(
      isRealPaidSale(
        purchase({ status: PurchaseStatus.PENDING, confirmedAt: null }),
      ),
    ).toBe(false);
    expect(isRealPaidSale(purchase({ provider: 'card' }))).toBe(true);
    expect(
      isRealPaidSale(
        purchase({ provider: 'card', status: PurchaseStatus.REFUNDED }),
      ),
    ).toBe(false);
    expect(
      isRealPaidSale(
        purchase({
          provider: 'card',
          status: PurchaseStatus.FAILED,
          confirmedAt: null,
        }),
      ),
    ).toBe(false);
  });

  it('texto da denúncia cita o tipo e o motivo, sem dados sensíveis', () => {
    const copy = reportCreatedCopy({
      targetType: 'VENUE',
      reason: 'SPAM',
      snapshot: {
        name: 'Bar Central',
        description: 'descrição completa secreta',
        authorName: 'Ana Silva',
        testimonial: 'texto da avaliação',
      },
    });
    expect(copy).toEqual({
      title: 'Nova denúncia recebida 🚩',
      body: 'Uma nova denúncia de estabelecimento foi registrada no After. Motivo: spam.',
    });
    expect(JSON.stringify(copy)).not.toContain('descrição completa');
    expect(JSON.stringify(copy)).not.toContain('Ana Silva');
    expect(JSON.stringify(copy)).not.toContain('texto da avaliação');
    expect(JSON.stringify(copy)).not.toContain('Bar Central');

    expect(
      reportCreatedCopy({
        targetType: 'BANNER',
        reason: 'MISLEADING',
        snapshot: { venueName: 'Bar Central', title: 'Happy hour secreto' },
      }).body,
    ).toBe(
      'Uma nova denúncia de promoção foi registrada no After. Motivo: informação enganosa.',
    );
    expect(
      reportCreatedCopy({ targetType: 'PHOTO', reason: 'OTHER', snapshot: {} }).body,
    ).toBe('Uma nova denúncia de foto foi registrada no After. Motivo: outro.');
    expect(reportCreatedCopy({ targetType: 'VIDEO', reason: 'VIOLENCE' }).body).toContain(
      'vídeo',
    );
    expect(reportCreatedCopy({ targetType: 'REVIEW', reason: 'HATE' }).body).toContain(
      'comentário',
    );
    expect(reportCreatedCopy({ targetType: 'EVENT', reason: 'UNKNOWN' }).body).toContain(
      'outro',
    );
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

  it('USER gera exatamente um ACCOUNT_CREATED e nenhum VENUE_CREATED', async () => {
    const user = {
      id: 'user-1',
      name: 'João Silva',
      role: Role.USER,
      venue: null,
    };
    await service.notifyConsumerAccountCreated(user);
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].title).toBe('Nova conta no After');
    expect(messaging.calls[0].data.type).toBe(
      AdminPushEventType.ACCOUNT_CREATED,
    );
    expect(messaging.calls[0].data.entityId).toBe('user-1');
    expect(messaging.calls.map((item) => item.data.type)).not.toContain(
      AdminPushEventType.VENUE_CREATED,
    );
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
  });

  it('VENUE gera exatamente um VENUE_CREATED e nenhum ACCOUNT_CREATED', async () => {
    const user = {
      id: 'user-2',
      name: 'Maria',
      role: Role.VENUE,
      venue: { id: 'venue-9', name: 'Bar Central' },
    };
    await service.notifyConsumerAccountCreated(user);
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].data.type).toBe(AdminPushEventType.VENUE_CREATED);
    expect(messaging.calls[0].data.entityId).toBe('venue-9');
    expect(messaging.calls[0].data.accountId).toBe('user-2');
    expect(messaging.calls[0].title).toBe('Novo estabelecimento cadastrado 🏪');
    expect(messaging.calls[0].body).toBe(
      'Bar Central acabou de se cadastrar no After.',
    );
    expect(messaging.calls.map((item) => item.data.type)).not.toContain(
      AdminPushEventType.ACCOUNT_CREATED,
    );
    expect(prisma.adminPushEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminPushEvent.create).toHaveBeenCalledWith({
      data: {
        type: AdminPushEventType.VENUE_CREATED,
        entityId: 'venue-9',
      },
    });
  });

  it('VENUE_CREATED é idempotente', async () => {
    const user = {
      id: 'user-2',
      name: 'Maria',
      role: Role.VENUE,
      venue: { id: 'venue-9', name: 'Bar Central' },
    };
    await service.notifyConsumerAccountCreated(user);
    await service.notifyConsumerAccountCreated(user);
    expect(prisma.adminPushEvent.create).toHaveBeenCalledTimes(2);
    expect(messaging.calls).toHaveLength(1);
    expect(accountCreatedCopy(Role.VENUE, 'Maria').body).toContain(
      'conta de estabelecimento',
    );
  });

  it('VENUE sem estabelecimento associado não gera push algum', async () => {
    await service.notifyConsumerAccountCreated({
      id: 'user-3',
      name: 'Sem venue',
      role: Role.VENUE,
      venue: null,
    });
    expect(prisma.adminPushEvent.create).not.toHaveBeenCalled();
    expect(messaging.calls).toHaveLength(0);
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

  it('PURCHASE_PAID inclui o nome do local e envia aos mesmos admins', async () => {
    await service.notifyPurchasePaid(
      purchase({
        credits: 10,
        amountPaid: new Prisma.Decimal('200.00'),
        provider: 'google_play',
      }),
    );
    expect(prisma.venue.findUnique).toHaveBeenCalledWith({
      where: { id: 'venue-1' },
      select: { name: true },
    });
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].title).toBe('Nova venda no After');
    expect(messaging.calls[0].body).toMatch(
      /^Refúgio do Chef — 10 créditos vendidos por R\$\s*200,00 via Google Play\.$/,
    );
    expect(messaging.calls[0].tokens).toEqual([
      'fcm-android-token-1',
      'fcm-ios-token-2xxxx',
    ]);
    expect(messaging.calls[0].data).toEqual({
      type: 'PURCHASE_PAID',
      entityId: 'sale-1',
    });
  });

  it('PURCHASE_PAID Apple e PIX também prefixam o nome do local', async () => {
    await service.notifyPurchasePaid(
      purchase({
        id: 'sale-apple',
        credits: 10,
        amountPaid: new Prisma.Decimal('200.00'),
        provider: 'app_store',
      }),
    );
    await service.notifyPurchasePaid(
      purchase({
        id: 'sale-pix',
        credits: 10,
        amountPaid: new Prisma.Decimal('200.00'),
        provider: 'pix',
      }),
    );
    expect(messaging.calls[0].body).toMatch(
      /^Refúgio do Chef — 10 créditos vendidos por R\$\s*200,00 via Apple\.$/,
    );
    expect(messaging.calls[1].body).toMatch(
      /^Refúgio do Chef — 10 créditos vendidos por R\$\s*200,00 via PIX\.$/,
    );
    expect(messaging.calls.map((item) => item.tokens)).toEqual([
      ['fcm-android-token-1', 'fcm-ios-token-2xxxx'],
      ['fcm-android-token-1', 'fcm-ios-token-2xxxx'],
    ]);
  });

  it('PURCHASE_PAID sem nome do local usa o texto antigo', async () => {
    prisma.venue.findUnique.mockResolvedValue(null);
    await service.notifyPurchasePaid(
      purchase({
        credits: 10,
        amountPaid: new Prisma.Decimal('200.00'),
        provider: 'google_play',
      }),
    );
    expect(messaging.calls[0].title).toBe('Nova venda no After');
    expect(messaging.calls[0].body).toMatch(
      /^10 créditos vendidos por R\$\s*200,00 via Google Play\.$/,
    );
    expect(messaging.calls[0].tokens).toHaveLength(2);
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

  it('cartão pago usa o push financeiro existente', async () => {
    await service.notifyPurchasePaid(
      purchase({
        id: 'sale-card',
        credits: 1,
        amountPaid: new Prisma.Decimal('34.90'),
        provider: 'card',
        providerTxId: 'card:ORD1',
      }),
    );
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].title).toBe('Nova compra de créditos 💳');
    expect(messaging.calls[0].body).toMatch(
      /^Refúgio do Chef comprou 1 crédito por R\$\s*34,90 via cartão de crédito\.$/,
    );
    expect(messaging.calls[0].body).not.toContain('MP *');
    expect(messaging.calls[0].tokens).toEqual([
      'fcm-android-token-1',
      'fcm-ios-token-2xxxx',
    ]);
  });

  it('cartão pendente, recusado ou estornado não envia push financeiro', async () => {
    await service.notifyPurchasePaid(
      purchase({ provider: 'card', status: PurchaseStatus.PENDING, confirmedAt: null }),
    );
    await service.notifyPurchasePaid(
      purchase({ provider: 'card', status: PurchaseStatus.FAILED, confirmedAt: null }),
    );
    await service.notifyPurchasePaid(
      purchase({ provider: 'card', status: PurchaseStatus.REFUNDED }),
    );
    expect(messaging.calls).toHaveLength(0);
  });

  it('denúncia notifica os administradores uma única vez', async () => {
    await service.notifyReportCreated({
      id: 'report-1',
      targetType: 'VENUE',
      reason: 'SPAM',
      snapshot: {
        name: 'Bar Central',
        description: 'não pode ir no push',
        reporterEmail: 'pessoa@after.local',
      },
    });
    await service.notifyReportCreated({
      id: 'report-1',
      targetType: 'VENUE',
      reason: 'SPAM',
      snapshot: { name: 'Bar Central' },
    });

    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0]).toMatchObject({
      tokens: ['fcm-android-token-1', 'fcm-ios-token-2xxxx'],
      title: 'Nova denúncia recebida 🚩',
      body: 'Uma nova denúncia de estabelecimento foi registrada no After. Motivo: spam.',
      data: { type: 'REPORT_CREATED', entityId: 'report-1' },
    });
    expect(JSON.stringify(messaging.calls[0])).not.toContain('não pode ir');
    expect(JSON.stringify(messaging.calls[0])).not.toContain('pessoa@after.local');
    expect(JSON.stringify(messaging.calls[0])).not.toContain('Bar Central');
    expect(prisma.userDeviceToken.findMany).not.toHaveBeenCalled();
  });

  it('falha do FCM não desfaz o evento e token inválido é removido', async () => {
    messaging.results = (tokens) =>
      tokens.map((token, index) => ({
        token,
        success: index === 1,
        invalid: index === 0,
      }));
    await expect(
      service.notifyReportCreated({ id: 'report-2', targetType: 'PHOTO' }),
    ).resolves.toBeUndefined();
    expect(prisma.adminDeviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['fcm-android-token-1'] } },
    });
    expect(prisma.adminPushEvent.update).toHaveBeenCalled();
  });

  it('FCM indisponível depois da denúncia grava o erro e não relança', async () => {
    messaging.sendToTokens = () => Promise.reject(new Error('fcm down'));
    await expect(
      service.notifyReportCreated({ id: 'report-3', targetType: 'REVIEW' }),
    ).resolves.toBeUndefined();
    expect(prisma.adminPushEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ error: expect.any(String) }),
      }),
    );
  });

  it('sem token administrativo não envia push', async () => {
    prisma.adminDeviceToken.findMany.mockResolvedValue([]);
    await service.notifyReportCreated({ id: 'report-4', targetType: 'VIDEO' });
    expect(messaging.calls).toHaveLength(0);
    expect(prisma.userDeviceToken.findMany).not.toHaveBeenCalled();
  });

  it('cupom resgatado notifica uma vez e a repetição não duplica', async () => {
    const input = {
      redemptionId: 'red-1',
      couponId: 'coupon-1',
      code: 'AFTER2',
      venueName: 'Bar Central',
    };
    await service.notifyCouponRedeemed(input);
    await service.notifyCouponRedeemed(input);
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0]).toMatchObject({
      tokens: ['fcm-android-token-1', 'fcm-ios-token-2xxxx'],
      title: 'Cupom utilizado 🎟️',
      body: 'O cupom AFTER2 foi utilizado no estabelecimento Bar Central.',
      data: {
        type: 'COUPON_REDEEMED',
        entityId: 'red-1',
        couponId: 'coupon-1',
      },
    });
  });

  it('falha do FCM no cupom não relança', async () => {
    messaging.sendToTokens = () => Promise.reject(new Error('fcm down'));
    await expect(
      service.notifyCouponRedeemed({
        redemptionId: 'red-2',
        couponId: 'coupon-1',
        code: 'AFTER2',
        venueName: 'Bar Central',
      }),
    ).resolves.toBeUndefined();
    expect(prisma.adminPushEvent.update).toHaveBeenCalled();
  });
});
