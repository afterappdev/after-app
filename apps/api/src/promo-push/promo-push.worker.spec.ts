import { FirebaseMessagingPort } from '../admin/push/firebase-messaging.port';
import { AudienceCandidate, canClaimPromoPushEvent } from './promo-push.audience';
import { PromoPushWorker } from './promo-push.worker';
import {
  DeliveryClaim,
  PromoPushEventView,
  PromoPushFinish,
  PromoPushStore,
} from './promo-push.store';

const SECRET = 'SECRET_TOKEN_VALUE_123456';
const now = new Date('2026-10-20T15:00:00.000Z');
const todayStart = new Date('2026-10-20T03:00:00.000Z');
const todayEnd = new Date('2026-10-21T03:00:00.000Z');

type MemEvent = PromoPushEventView & {
  status: string;
  lockedUntil: Date | null;
  lockedBy: string | null;
  error: string | null;
  sentAt: Date | null;
};

class MemoryStore implements PromoPushStore {
  walletUpdates = 0;
  events = new Map<string, MemEvent>();
  deliveries = new Map<string, { status: string; userId: string }>();
  disabled = new Set<string>();
  allowlistSeen: string[] | null = null;
  candidates: AudienceCandidate[] = [];
  recent = new Map<string, number>();

  acquireLock(): Promise<boolean> {
    return Promise.resolve(true);
  }
  releaseLock(): Promise<void> {
    return Promise.resolve();
  }
  expireOverdue(): Promise<number> {
    return Promise.resolve(0);
  }

  listReadyIds(at: Date): Promise<string[]> {
    return Promise.resolve(
      [...this.events.values()]
        .filter((event) => canClaimPromoPushEvent(event, at))
        .map((event) => event.id),
    );
  }

  claim(id: string, workerId: string, at: Date, leaseMs: number): Promise<boolean> {
    const event = this.events.get(id);
    if (!event || !canClaimPromoPushEvent(event, at)) return Promise.resolve(false);
    event.status = 'PROCESSING';
    event.lockedUntil = new Date(at.getTime() + leaseMs);
    event.lockedBy = workerId;
    event.attempts += 1;
    return Promise.resolve(true);
  }

  load(id: string): Promise<PromoPushEventView | null> {
    const event = this.events.get(id);
    return Promise.resolve(event ? { ...event } : null);
  }

  loadAudience(
    _event: PromoPushEventView,
    _freshAfter: Date,
    allowlist: string[] | null,
  ): Promise<AudienceCandidate[]> {
    this.beforeAudience?.();
    this.allowlistSeen = allowlist;
    const rows = allowlist
      ? this.candidates.filter((candidate) => allowlist.includes(candidate.id))
      : this.candidates;
    return Promise.resolve(rows);
  }

  recentEventCounts(): Promise<Map<string, number>> {
    return Promise.resolve(this.recent);
  }

  claimDeliveries(
    eventId: string,
    items: { tokenId: string; token: string; userId: string }[],
  ): Promise<DeliveryClaim[]> {
    return Promise.resolve(
      items.map((item) => {
        const key = `${eventId}:${item.tokenId}`;
        const current = this.deliveries.get(key);
        if (!current) {
          this.deliveries.set(key, { status: 'CLAIMED', userId: item.userId });
        }
        return {
          ...item,
          alreadySent: this.deliveries.get(key)?.status === 'SENT',
        };
      }),
    );
  }

  markDeliveries(updates: { eventId: string; tokenId: string; status: string }[]): Promise<void> {
    if (this.failMark) {
      this.failMark = false;
      return Promise.reject(new Error('crash after accept'));
    }
    for (const update of updates) {
      this.deliveries.set(`${update.eventId}:${update.tokenId}`, {
        status: update.status,
        userId: this.deliveries.get(`${update.eventId}:${update.tokenId}`)?.userId ?? '',
      });
    }
    return Promise.resolve();
  }

  disableToken(tokenId: string): Promise<void> {
    this.disabled.add(tokenId);
    return Promise.resolve();
  }

  beforeAudience: (() => void) | null = null;
  failMark = false;

  release(id: string, workerId: string, attempts: number): Promise<void> {
    const event = this.events.get(id);
    if (!event || event.lockedBy !== workerId) return Promise.resolve();
    event.status = 'PENDING';
    event.error = 'PROMO_PUSH_DISABLED';
    event.lockedBy = null;
    event.lockedUntil = null;
    event.attempts = attempts;
    return Promise.resolve();
  }

  finish(id: string, workerId: string, patch: PromoPushFinish): Promise<void> {
    const event = this.events.get(id);
    if (!event || event.lockedBy !== workerId) return Promise.resolve();
    event.status = patch.status;
    event.error = patch.error;
    event.lockedBy = null;
    event.lockedUntil = null;
    if (patch.availableAt) event.availableAt = patch.availableAt;
    if (patch.sentAt !== undefined) event.sentAt = patch.sentAt ?? null;
    return Promise.resolve();
  }
}

class FakeMessaging implements FirebaseMessagingPort {
  configured = true;
  calls: {
    tokens: string[];
    title: string;
    imageUrl?: string;
    data: Record<string, string>;
  }[] = [];
  mode: 'ok' | 'invalid' | 'temporary' | 'throw' = 'ok';
  onCall: (() => void) | null = null;

  sendToTokens(
    tokens: string[],
    message: {
      title: string;
      body: string;
      imageUrl?: string;
      data: Record<string, string>;
    },
  ) {
    this.calls.push({
      tokens: [...tokens],
      title: message.title,
      imageUrl: message.imageUrl,
      data: { ...message.data },
    });
    this.onCall?.();
    if (this.mode === 'throw') return Promise.reject(new Error(`down ${SECRET}`));
    return Promise.resolve(
      tokens.map((token) => ({
        token,
        success: this.mode === 'ok',
        invalid: this.mode === 'invalid',
      })),
    );
  }
}

function event(overrides: Partial<MemEvent> = {}): MemEvent {
  return {
    id: 'evt-1',
    bannerId: 'banner-1',
    venueId: 'venue-1',
    scheduleId: 'sch-1',
    ibgeCityId: 3550308,
    contentKind: null,
    venueName: 'Bar Central',
    bannerTitle: 'Promo do dia',
    venueLogoUrl: 'https://media.app-after.com.br/uploads/logo.jpg',
    bannerStatus: 'ACTIVE',
    venueHidden: false,
    scheduleTier: 'VIP',
    vipCreditEntryId: 'proof-1',
    attempts: 0,
    availableAt: todayStart,
    expiresAt: todayEnd,
    status: 'PENDING',
    lockedUntil: null,
    lockedBy: null,
    error: null,
    sentAt: null,
    ...overrides,
  };
}

function user(overrides: Partial<AudienceCandidate> = {}): AudienceCandidate {
  return {
    id: 'user-1',
    role: 'USER',
    promoNotificationsEnabled: true,
    ibgeCityId: 3550308,
    lastAuthorizedIbgeCityId: null,
    lastAuthorizedCityAt: null,
    blocked: false,
    tokens: [{ id: 'tok-1', token: SECRET, disabledAt: null }],
    ...overrides,
  };
}

function setup() {
  const store = new MemoryStore();
  const messaging = new FakeMessaging();
  const logs: string[] = [];
  store.events.set('evt-1', event());
  store.candidates = [user()];
  const worker = new PromoPushWorker(store, messaging)
    .useLogger((line) => logs.push(line))
    .useEnv({
      PROMO_PUSH_ENABLED: 'true',
      PROMO_PUSH_MAX_PER_USER_PER_DAY: '5',
      PROMO_PUSH_LOCATION_MAX_AGE_HOURS: '6',
    })
    .useWorkerId('worker-a');
  return { store, messaging, logs, worker };
}

describe('PromoPushWorker', () => {
  it('envia uma vez para a cidade cadastrada e não registra o token', async () => {
    const { store, messaging, logs, worker } = setup();
    await worker.dispatchDue(now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].tokens).toEqual([SECRET]);
    expect(messaging.calls[0].title).toBe(
      'Bar Central publicou "Promo do dia"',
    );
    expect(messaging.calls[0].imageUrl).toBe(
      'https://media.app-after.com.br/uploads/logo.jpg',
    );
    expect(messaging.calls[0].data.type).toBe('PROMO_PUBLISHED');
    expect(messaging.calls[0].data.imageUrl).toBe(
      'https://media.app-after.com.br/uploads/logo.jpg',
    );
    expect(messaging.calls[0].data.bannerId).toBe('banner-1');
    expect(store.events.get('evt-1')?.status).toBe('SENT');
    expect(logs.join('\n')).not.toContain(SECRET);
    expect(store.walletUpdates).toBe(0);
  });

  it('não dispara com a flag desligada', async () => {
    const { messaging, worker } = setup();
    worker.useEnv({ PROMO_PUSH_ENABLED: 'false' });
    await worker.dispatchDue(now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
  });

  it('allowlist envia só para os ids autorizados', async () => {
    const { store, messaging, worker } = setup();
    store.candidates = [
      user({ id: 'allowed', tokens: [{ id: 'tok-a', token: 'token-aaaa', disabledAt: null }] }),
      user({ id: 'other', tokens: [{ id: 'tok-b', token: 'token-bbbb', disabledAt: null }] }),
    ];
    worker.useEnv({
      PROMO_PUSH_ENABLED: 'true',
      PROMO_PUSH_ALLOWLIST_USER_IDS: 'allowed',
    });
    await worker.dispatchDue(now, { kind: 'public' });
    expect(store.allowlistSeen).toEqual(['allowed']);
    expect(messaging.calls[0].tokens).toEqual(['token-aaaa']);
  });

  it('não envia cidade detectada vencida nem homônimo', async () => {
    const { store, messaging, worker } = setup();
    store.candidates = [
      user({
        id: 'stale',
        ibgeCityId: 3304557,
        lastAuthorizedIbgeCityId: 3550308,
        lastAuthorizedCityAt: new Date(now.getTime() - 7 * 60 * 60 * 1000),
      }),
      user({
        id: 'homonym',
        ibgeCityId: 2201903,
        tokens: [{ id: 'tok-h', token: 'token-homonym', disabledAt: null }],
      }),
    ];
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
    expect(store.events.get('evt-1')?.status).toBe('SENT');
  });

  it('envia pela cidade detectada recente', async () => {
    const { store, messaging, worker } = setup();
    store.candidates = [
      user({
        ibgeCityId: 3304557,
        lastAuthorizedIbgeCityId: 3550308,
        lastAuthorizedCityAt: new Date(now.getTime() - 60_000),
        tokens: [{ id: 'tok-g', token: 'token-geo', disabledAt: null }],
      }),
    ];
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls[0].tokens).toEqual(['token-geo']);
  });

  it('não envia para opt-out nem para quem bloqueou o estabelecimento', async () => {
    const { store, messaging, worker } = setup();
    store.candidates = [
      user({ id: 'out', promoNotificationsEnabled: false }),
      user({ id: 'blocked', blocked: true }),
    ];
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
  });

  it('pula estabelecimento oculto e banner cancelado sem chamar o FCM', async () => {
    const hidden = setup();
    hidden.store.events.set('evt-1', event({ venueHidden: true }));
    await hidden.worker.processOne('evt-1', now, { kind: 'public' });
    expect(hidden.messaging.calls).toEqual([]);
    expect(hidden.store.events.get('evt-1')?.error).toBe('VENUE_HIDDEN');

    const cancelled = setup();
    cancelled.store.events.set('evt-1', event({ bannerStatus: 'CANCELLED' }));
    await cancelled.worker.processOne('evt-1', now, { kind: 'public' });
    expect(cancelled.messaging.calls).toEqual([]);
    expect(cancelled.store.events.get('evt-1')?.error).toBe('BANNER_CANCELLED');
    expect(cancelled.store.walletUpdates).toBe(0);
  });

  it('segura agenda futura e envia quando o dia civil chega', async () => {
    const { store, messaging, worker } = setup();
    store.events.set(
      'evt-1',
      event({
        availableAt: new Date('2026-10-21T03:00:00.000Z'),
        expiresAt: new Date('2026-10-22T03:00:00.000Z'),
      }),
    );
    await worker.dispatchDue(now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
    await worker.dispatchDue(new Date('2026-10-21T03:00:00.000Z'), { kind: 'public' });
    expect(messaging.calls).toHaveLength(1);
  });

  it('respeita o limite de cinco notificações', async () => {
    const { store, messaging, worker } = setup();
    store.recent.set('user-1', 5);
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
  });

  it('deduplica o mesmo token e entrega um por dispositivo', async () => {
    const { store, messaging, worker } = setup();
    store.candidates = [
      user({
        tokens: [
          { id: 'tok-1', token: SECRET, disabledAt: null },
          { id: 'tok-2', token: SECRET, disabledAt: null },
          { id: 'tok-3', token: 'token-other-device', disabledAt: null },
        ],
      }),
    ];
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls[0].tokens).toEqual([SECRET, 'token-other-device']);
  });

  it('invalida token rejeitado e não o repete', async () => {
    const { store, messaging, worker } = setup();
    messaging.mode = 'invalid';
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(store.disabled.has('tok-1')).toBe(true);
    expect(store.deliveries.get('evt-1:tok-1')?.status).toBe('INVALID');
    expect(store.events.get('evt-1')?.status).toBe('SENT');
  });

  it('falha temporária agenda retentativa sem segunda linha de entrega', async () => {
    const { store, messaging, worker } = setup();
    messaging.mode = 'temporary';
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(store.events.get('evt-1')?.status).toBe('PENDING');
    expect(store.events.get('evt-1')?.error).toBe('FCM_TEMPORARY');
    expect(store.walletUpdates).toBe(0);
    messaging.mode = 'ok';
    const retryAt = store.events.get('evt-1')!.availableAt;
    await worker.processOne('evt-1', retryAt, { kind: 'public' });
    expect(messaging.calls).toHaveLength(2);
    expect(store.deliveries.get('evt-1:tok-1')?.status).toBe('SENT');
    expect(store.events.get('evt-1')?.status).toBe('SENT');
  });

  it('recupera um processamento abandonado depois que o lock expira', async () => {
    const { store, messaging, worker } = setup();
    store.events.set(
      'evt-1',
      event({
        status: 'PROCESSING',
        lockedUntil: new Date(now.getTime() - 1000),
        lockedBy: 'dead-worker',
        attempts: 1,
      }),
    );
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(1);
    expect(store.events.get('evt-1')?.status).toBe('SENT');
  });

  it('dois workers no mesmo evento geram um único envio', async () => {
    const { store, messaging } = setup();
    const other = new PromoPushWorker(store, messaging)
      .useEnv({ PROMO_PUSH_ENABLED: 'true' })
      .useWorkerId('worker-b');
    const first = new PromoPushWorker(store, messaging)
      .useEnv({ PROMO_PUSH_ENABLED: 'true' })
      .useWorkerId('worker-a');
    await Promise.all([
      first.processOne('evt-1', now, { kind: 'public' }),
      other.processOne('evt-1', now, { kind: 'public' }),
    ]);
    expect(messaging.calls).toHaveLength(1);
  });

  it('várias datas deixam só a de hoje pronta', async () => {
    const { store, messaging, worker } = setup();
    store.events.set(
      'evt-future',
      event({
        id: 'evt-future',
        scheduleId: 'sch-future',
        availableAt: new Date('2026-10-22T03:00:00.000Z'),
        expiresAt: new Date('2026-10-23T03:00:00.000Z'),
      }),
    );
    await worker.dispatchDue(now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].data.scheduleId).toBe('sch-1');
    expect(store.events.get('evt-future')?.status).toBe('PENDING');
  });

  it('flag ausente no meio do processamento não chama o FCM', async () => {
    const { store, messaging, worker } = setup();
    worker.useEnv({});
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(0);
    expect(store.events.get('evt-1')?.status).toBe('PENDING');
    expect(store.events.get('evt-1')?.attempts).toBe(0);
  });

  it('desligar a flag depois do claim devolve o evento sem envio', async () => {
    const { store, messaging, worker } = setup();
    store.beforeAudience = () => {
      worker.useEnv({ PROMO_PUSH_ENABLED: 'false' });
    };
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(0);
    expect(store.events.get('evt-1')?.status).toBe('PENDING');
    expect(store.events.get('evt-1')?.error).toBe('PROMO_PUSH_DISABLED');
    expect(store.events.get('evt-1')?.attempts).toBe(0);
  });

  it('allowlist aplicada durante o processamento não deixa o público passar', async () => {
    const { store, messaging, worker } = setup();
    store.candidates = [
      user({ id: 'user-a' }),
      user({
        id: 'user-b',
        tokens: [{ id: 'tok-b', token: 'token-bbbbbbbbbbbb', disabledAt: null }],
      }),
    ];
    store.beforeAudience = () => {
      worker.useEnv({
        PROMO_PUSH_ENABLED: 'true',
        PROMO_PUSH_ALLOWLIST_USER_IDS: 'user-a',
      });
    };
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].tokens).toEqual([SECRET]);
  });

  it('aceite do FCM sem gravar o resultado pode enviar outra vez', async () => {
    const { store, messaging, worker } = setup();
    store.failMark = true;
    await expect(
      worker.processOne('evt-1', now, { kind: 'public' }),
    ).rejects.toThrow('crash after accept');
    expect(messaging.calls).toHaveLength(1);
    expect(store.deliveries.get('evt-1:tok-1')?.status).toBe('CLAIMED');
    const abandoned = store.events.get('evt-1');
    expect(abandoned?.status).toBe('PROCESSING');
    abandoned!.lockedUntil = new Date(now.getTime() - 1000);
    await worker.processOne('evt-1', new Date(now.getTime() + 1000), {
      kind: 'public',
    });
    expect(messaging.calls).toHaveLength(2);
    expect(store.deliveries.get('evt-1:tok-1')?.status).toBe('SENT');
  });

  it('direito VIP revogado depois do claim não chama o FCM', async () => {
    const { store, messaging, worker } = setup();
    let loads = 0;
    const load = store.load.bind(store);
    store.load = (id) => {
      loads += 1;
      if (loads > 1) {
        store.events.get(id)!.scheduleTier = 'COMMON';
      }
      return load(id);
    };
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
    expect(store.events.get('evt-1')?.status).toBe('SKIPPED');
    expect(store.events.get('evt-1')?.error).toBe('NOT_VIP');
  });

  it('lote já aceito pelo FCM permanece e o lote seguinte não sai', async () => {
    const { store, messaging, worker } = setup();
    const tokens = Array.from({ length: 501 }, (_, index) => ({
      id: `tok-${index}`,
      token: `token-${String(index).padStart(12, '0')}`,
      disabledAt: null,
    }));
    store.candidates = [user({ tokens })];
    messaging.onCall = () => {
      store.events.get('evt-1')!.scheduleTier = 'COMMON';
    };
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toHaveLength(1);
    expect(messaging.calls[0].tokens).toHaveLength(500);
    expect(store.events.get('evt-1')?.status).toBe('SKIPPED');
    expect(store.events.get('evt-1')?.error).toBe('NOT_VIP');
  });

  it('não envia evento antigo de agenda comum', async () => {
    const { store, messaging, worker } = setup();
    store.events.set(
      'evt-1',
      event({ scheduleTier: 'COMMON', vipCreditEntryId: null }),
    );
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
    expect(store.events.get('evt-1')?.status).toBe('SKIPPED');
    expect(store.events.get('evt-1')?.error).toBe('NOT_VIP');
  });

  it('não envia quando o comprovante VIP não existe', async () => {
    const { store, messaging, worker } = setup();
    store.events.set('evt-1', event({ vipCreditEntryId: null }));
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
    expect(store.events.get('evt-1')?.error).toBe('VIP_RIGHT_INVALID');
  });

  it('cancelamento continua impedindo o envio do slot', async () => {
    const { store, messaging, worker } = setup();
    store.events.set('evt-1', event({ bannerStatus: 'CANCELLED' }));
    await worker.processOne('evt-1', now, { kind: 'public' });
    expect(messaging.calls).toEqual([]);
    expect(store.events.get('evt-1')?.error).toBe('BANNER_CANCELLED');
  });
});
