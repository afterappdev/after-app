import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminPushEventType, Role } from '@prisma/client';
import { AdminPushService } from '../admin/push/admin-push.service';
import type {
  AdminPushSendResult,
  FirebaseMessagingPort,
} from '../admin/push/firebase-messaging.port';
import { AuthService } from './auth.service';

function config(map: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

class FakeMessaging implements FirebaseMessagingPort {
  configured = true;
  calls: Array<{
    title: string;
    body: string;
    data: Record<string, string>;
  }> = [];

  sendToTokens(
    tokens: string[],
    message: { title: string; body: string; data: Record<string, string> },
  ): Promise<AdminPushSendResult[]> {
    this.calls.push(message);
    return Promise.resolve(
      tokens.map((token) => ({ token, success: true, invalid: false })),
    );
  }
}

function createPushPrisma() {
  const seen = new Set<string>();
  return {
    adminPushEvent: {
      create: jest.fn(
        ({ data }: { data: { type: string; entityId: string } }) => {
          const key = `${data.type}:${data.entityId}`;
          if (seen.has(key)) {
            return Promise.reject(
              Object.assign(new Error('unique'), { code: 'P2002' }),
            );
          }
          seen.add(key);
          return Promise.resolve({ id: `evt-${seen.size}`, ...data });
        },
      ),
      update: jest.fn(() => Promise.resolve({})),
    },
    adminDeviceToken: {
      findMany: jest.fn(() => Promise.resolve([{ token: 'fcm-token-1' }])),
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };
}

function createAuthPrisma() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    socialOnboardingToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof prisma) => unknown)(prisma);
    }
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });
  return prisma;
}

function createdUser(role: Role, venue: { id: string; name: string } | null) {
  return {
    id: role === Role.VENUE ? 'u-venue' : 'u-user',
    name: role === Role.VENUE ? 'Bar da Ada' : 'Nova Silva',
    email: 'nova@gmail.com',
    passwordHash: 'hash',
    role,
    state: 'SP',
    city: 'São Paulo',
    avatarUrl: null,
    venue,
  };
}

describe('Eventos administrativos de criação de conta', () => {
  const originalEnv = { ...process.env };
  let auth: AuthService;
  let authPrisma: ReturnType<typeof createAuthPrisma>;
  let push: AdminPushService;
  let pushPrisma: ReturnType<typeof createPushPrisma>;
  let messaging: FakeMessaging;
  let pending: Array<Promise<unknown>>;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    authPrisma = createAuthPrisma();
    pushPrisma = createPushPrisma();
    messaging = new FakeMessaging();
    push = new AdminPushService(pushPrisma as never, messaging);

    pending = [];
    const deliver = push.notifyConsumerAccountCreated.bind(push);
    jest
      .spyOn(push, 'notifyConsumerAccountCreated')
      .mockImplementation((user) => {
        const promise = deliver(user);
        pending.push(promise);
        return promise;
      });

    auth = new AuthService(
      authPrisma as never,
      new JwtService({ secret: 'test-secret' }),
      config({
        JWT_SECRET: 'test-secret',
        GOOGLE_CLIENT_ID: 'web.apps.googleusercontent.com',
      }),
      push,
    );

    authPrisma.user.findUnique.mockResolvedValue(null);
    authPrisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 0 });
    authPrisma.socialOnboardingToken.findFirst.mockResolvedValue(null);
    authPrisma.socialOnboardingToken.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'jti-1',
          ...args.data,
          usedAt: null,
        }),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function flushPush() {
    await Promise.all(pending);
  }

  function pushedTypes() {
    return messaging.calls.map((item) => item.data.type);
  }

  async function startSocialOnboarding() {
    jest.spyOn(auth as never, 'verifyGoogleIdToken').mockResolvedValue({
      sub: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      picture: null,
    } as never);
    const issued = await auth.loginWithGoogle({
      idToken: 'google-id-token-value-ok',
    });
    if (!('needsRegistration' in issued) || !issued.needsRegistration) {
      throw new Error('esperado fluxo de onboarding social');
    }

    authPrisma.socialOnboardingToken.updateMany.mockResolvedValue({ count: 1 });
    authPrisma.socialOnboardingToken.findUnique.mockResolvedValue({
      id: 'jti-1',
      provider: 'google',
      providerId: 'gid-new',
      email: 'nova@gmail.com',
      name: 'Nova Silva',
      avatarUrl: null,
      usedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    return issued.onboardingToken;
  }

  it('cadastro USER gera exatamente um ACCOUNT_CREATED', async () => {
    authPrisma.user.create.mockResolvedValue(createdUser(Role.USER, null));
    await auth.register({
      name: 'Nova Silva',
      email: 'nova@gmail.com',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: 'USER',
    });
    await flushPush();

    expect(messaging.calls).toHaveLength(1);
    expect(pushedTypes()).toEqual([AdminPushEventType.ACCOUNT_CREATED]);
    expect(messaging.calls[0].data.entityId).toBe('u-user');
  });

  it('cadastro USER não gera VENUE_CREATED', async () => {
    authPrisma.user.create.mockResolvedValue(createdUser(Role.USER, null));
    await auth.register({
      name: 'Nova Silva',
      email: 'nova@gmail.com',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: 'USER',
    });
    await flushPush();

    expect(pushedTypes()).not.toContain(AdminPushEventType.VENUE_CREATED);
  });

  it('cadastro VENUE gera exatamente um VENUE_CREATED e nenhum ACCOUNT_CREATED', async () => {
    authPrisma.user.create.mockResolvedValue(
      createdUser(Role.VENUE, { id: 'v-1', name: 'Bar da Ada' }),
    );
    await auth.register({
      name: 'Bar da Ada',
      email: 'nova@gmail.com',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: 'VENUE',
    });
    await flushPush();

    expect(messaging.calls).toHaveLength(1);
    expect(pushedTypes()).toEqual([AdminPushEventType.VENUE_CREATED]);
    expect(pushedTypes()).not.toContain(AdminPushEventType.ACCOUNT_CREATED);
    expect(messaging.calls[0].data.entityId).toBe('v-1');
    expect(messaging.calls[0].data.accountId).toBe('u-venue');
  });

  it('cadastro social USER gera apenas ACCOUNT_CREATED', async () => {
    const onboardingToken = await startSocialOnboarding();
    authPrisma.user.create.mockResolvedValue(createdUser(Role.USER, null));

    await auth.completeSocialRegistration({
      onboardingToken,
      accountType: 'user',
      name: 'Nova Silva',
      state: 'SP',
      city: 'São Paulo',
    });
    await flushPush();

    expect(pushedTypes()).toEqual([AdminPushEventType.ACCOUNT_CREATED]);
    expect(messaging.calls[0].data.entityId).toBe('u-user');
  });

  it('cadastro social VENUE gera apenas VENUE_CREATED', async () => {
    const onboardingToken = await startSocialOnboarding();
    authPrisma.user.create.mockResolvedValue(
      createdUser(Role.VENUE, { id: 'v-1', name: 'Bar da Ada' }),
    );

    await auth.completeSocialRegistration({
      onboardingToken,
      accountType: 'venue',
      name: 'Bar da Ada',
      state: 'SP',
      city: 'São Paulo',
    });
    await flushPush();

    expect(pushedTypes()).toEqual([AdminPushEventType.VENUE_CREATED]);
    expect(pushedTypes()).not.toContain(AdminPushEventType.ACCOUNT_CREATED);
    expect(messaging.calls[0].data.entityId).toBe('v-1');
    expect(messaging.calls[0].data.accountId).toBe('u-venue');
  });

  it('reenvio do mesmo cadastro VENUE não duplica o push', async () => {
    authPrisma.user.create.mockResolvedValue(
      createdUser(Role.VENUE, { id: 'v-1', name: 'Bar da Ada' }),
    );
    await auth.register({
      name: 'Bar da Ada',
      email: 'nova@gmail.com',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: 'VENUE',
    });
    await auth.register({
      name: 'Bar da Ada',
      email: 'nova@gmail.com',
      password: 'senha123',
      state: 'SP',
      city: 'São Paulo',
      role: 'VENUE',
    });
    await flushPush();

    expect(pushPrisma.adminPushEvent.create).toHaveBeenCalledTimes(2);
    expect(messaging.calls).toHaveLength(1);
  });
});
