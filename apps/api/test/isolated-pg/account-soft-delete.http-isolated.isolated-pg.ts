import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import {
  AccountLifecycleStatus,
  Role,
} from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminAccountsController } from '../../src/admin/accounts/admin-accounts.controller';
import { AdminAccountsService } from '../../src/admin/accounts/admin-accounts.service';
import { RolesGuard } from '../../src/admin/guards/roles.guard';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { PasswordResetService } from '../../src/auth/password-reset.service';
import { AccountRecoveryAuthGuard } from '../../src/auth/account-recovery-auth.guard';
import { DeletionScopeAuthGuard } from '../../src/auth/deletion-scope-auth.guard';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { SessionJwtAuthGuard } from '../../src/auth/session-jwt-auth.guard';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccountDeletionController } from '../../src/users/account-deletion.controller';
import { AccountDeletionService } from '../../src/users/account-deletion.service';
import { AccountLifecycleService } from '../../src/users/account-lifecycle.service';
import {
  generateDeletionToken,
  hashDeletionToken,
} from '../../src/users/account-deletion.crypto';
import { AppleAuthTokensService } from '../../src/auth/apple-auth-tokens.service';
import { MediaCleanupService } from '../../src/uploads/media-cleanup.service';
import { AccountDeletionMailer } from '../../src/users/account-deletion.mailer';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import {
  buildIsolatedDatabaseUrl,
  cleanupSoftDeleteFixtures,
  createActiveUser,
  openIsolatedPrisma,
  softDeleteSuiteEnabled,
} from './soft-delete.harness';

const suite = softDeleteSuiteEnabled() ? describe : describe.skip;

const mediaMock = {
  deleteStoredUpload: jest.fn(),
  deleteStoredUploads: jest.fn(),
  deleteStoredUploadsWithReport: jest.fn().mockResolvedValue({
    attempted: 0,
    removed: 0,
    failedUrls: [],
  }),
};
const appleMock = { revokeForAccount: jest.fn().mockResolvedValue(undefined) };
const mailerMock = {
  isConfigured: () => true,
  sendDeletionLink: jest.fn().mockResolvedValue(undefined),
};

const ISOLATED_JWT_SECRET = 'isolated-http-soft-delete-jwt';

suite('soft delete HTTP + isolated postgres', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = buildIsolatedDatabaseUrl();
    process.env.JWT_SECRET = ISOLATED_JWT_SECRET;
    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_APP_URL = 'http://localhost:8080';

    const configMock = {
      get: (key: string) =>
        key === 'JWT_SECRET' ? ISOLATED_JWT_SECRET : undefined,
      getOrThrow: (key: string) => {
        if (key === 'JWT_SECRET') return ISOLATED_JWT_SECRET;
        throw new Error(`missing config ${key}`);
      },
    };

    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: ISOLATED_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [
        UsersController,
        AccountDeletionController,
        AuthController,
        AdminAccountsController,
      ],
      providers: [
        PrismaService,
        UsersService,
        AccountLifecycleService,
        AccountDeletionService,
        AdminAccountsService,
        AuthService,
        JwtStrategy,
        SessionJwtAuthGuard,
        AccountRecoveryAuthGuard,
        DeletionScopeAuthGuard,
        JwtAuthGuard,
        RolesGuard,
        { provide: ConfigService, useValue: configMock },
        { provide: MediaCleanupService, useValue: mediaMock },
        { provide: AppleAuthTokensService, useValue: appleMock },
        { provide: AccountDeletionMailer, useValue: mailerMock },
        {
          provide: PasswordResetService,
          useValue: {
            requestReset: jest.fn(),
            confirmReset: jest.fn(),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    jwt = module.get(JwtService);
    prisma = module.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  afterEach(async () => {
    const client = await openIsolatedPrisma();
    try {
      await cleanupSoftDeleteFixtures(client);
    } finally {
      await client.$disconnect();
    }
  });

  function sessionToken(user: { id: string; email: string; role: Role; sv?: number }) {
    return jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      sv: user.sv ?? 0,
    });
  }

  async function recoveryTokenViaLogin(email: string) {
    const row = await prisma.user.findFirst({ where: { email } });
    if (row) {
      await prisma.user.update({
        where: { id: row.id },
        data: { sessionInvalidatedAt: new Date(Date.now() - 60_000) },
      });
    }
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'isolated-only' });
    expect(res.status).toBe(201);
    expect(res.body.recoveryToken).toBeDefined();
    return res.body.recoveryToken as string;
  }

  it('POST /users/me/deletion-request e GET deletion-status', async () => {
    const client = await openIsolatedPrisma();
    const user = await createActiveUser(client);
    await client.$disconnect();
    const token = sessionToken({ id: user.id, email: user.email, role: Role.USER });

    const schedule = await request(app.getHttpServer())
      .post('/users/me/deletion-request')
      .set('Authorization', `Bearer ${token}`);
    expect(schedule.status).toBe(201);

    await request(app.getHttpServer())
      .get('/users/me/deletion-status')
      .set('Authorization', `Bearer ${await recoveryTokenViaLogin(user.email)}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.accountStatus).toBe(
          AccountLifecycleStatus.PENDING_DELETION,
        );
      });
  });

  it('POST /users/me/deletion-cancel com recovery token', async () => {
    const client = await openIsolatedPrisma();
    const user = await createActiveUser(client);
    const lifecycle = new AccountLifecycleService(client as never);
    await lifecycle.scheduleAccountDeletion(user.id);
    await client.$disconnect();

    await request(app.getHttpServer())
      .post('/users/me/deletion-cancel')
      .set('Authorization', `Bearer ${await recoveryTokenViaLogin(user.email)}`)
      .expect(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.accountStatus).toBe(AccountLifecycleStatus.ACTIVE);
  });

  it('DELETE /users/me agenda exclusão', async () => {
    const client = await openIsolatedPrisma();
    const user = await createActiveUser(client);
    await client.$disconnect();
    const token = sessionToken({ id: user.id, email: user.email, role: Role.USER });

    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.accountStatus).toBe(AccountLifecycleStatus.PENDING_DELETION);
  });

  it('POST delete-request e delete-confirm', async () => {
    const client = await openIsolatedPrisma();
    const user = await createActiveUser(client);
    const raw = generateDeletionToken();
    const tokenHash = hashDeletionToken(raw);
    await client.accountDeletionRequest.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await client.$disconnect();

    await request(app.getHttpServer())
      .post('/users/delete-confirm')
      .send({ token: raw })
      .expect(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.accountStatus).toBe(AccountLifecycleStatus.PENDING_DELETION);
  });

  it('POST /auth/login PENDING_DELETION retorna recovery; PURGED rejeita', async () => {
    const client = await openIsolatedPrisma();
    const pending = await createActiveUser(client);
    const lifecycle = new AccountLifecycleService(client as never);
    await lifecycle.scheduleAccountDeletion(pending.id);

    const purged = await createActiveUser(client);
    const purgedEmail = `purged+${purged.id}@deleted.after.local`;
    await client.user.update({
      where: { id: purged.id },
      data: {
        accountStatus: AccountLifecycleStatus.PURGED,
        email: purgedEmail,
      },
    });
    await client.$disconnect();

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: pending.email, password: 'isolated-only' })
      .expect(201)
      .expect((res) => {
        expect(res.body.accountPendingDeletion).toBe(true);
        expect(res.body.recoveryToken).toBeDefined();
      });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: purgedEmail, password: 'isolated-only' })
      .expect(401);
  });

  it('DELETE /admin/accounts/:id com ADMIN', async () => {
    const client = await openIsolatedPrisma();
    const target = await createActiveUser(client);
    const admin = await createActiveUser(client, Role.ADMIN);
    await client.$disconnect();
    const adminToken = jwt.sign({
      sub: admin.id,
      email: admin.email,
      role: Role.ADMIN,
    });

    await request(app.getHttpServer())
      .delete(`/admin/accounts/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });
});
