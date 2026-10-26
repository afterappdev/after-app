import { INestApplication, ValidationPipe } from '@nestjs/common';
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
import { AccountRecoveryAuthGuard } from '../auth/account-recovery-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { SessionJwtAuthGuard } from '../auth/session-jwt-auth.guard';
import { ACCOUNT_RECOVERY_TYP } from './account-recovery';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('Account soft delete HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const users = {
    requestAccountDeletion: jest.fn(),
    cancelAccountDeletion: jest.fn(),
    getDeletionStatus: jest.fn(),
    getMe: jest.fn(),
    deleteAccount: jest.fn(),
  };
  const prisma = {
    user: { findUnique: jest.fn() },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: users },
        JwtStrategy,
        SessionJwtAuthGuard,
        AccountRecoveryAuthGuard,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-secret' },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    users.getMe.mockResolvedValue({ id: 'u1' });
    users.requestAccountDeletion.mockResolvedValue({
      deletionRequestedAt: new Date(),
      permanentDeletionAt: new Date(),
      remainingSeconds: 100,
    });
    users.getDeletionStatus.mockResolvedValue({
      accountStatus: AccountLifecycleStatus.ACTIVE,
      remainingSeconds: 0,
    });
  });

  function sessionToken(extra: Record<string, unknown> = {}) {
    return jwt.sign({
      sub: 'u1',
      email: 'u@after.local',
      role: Role.USER,
      sv: 0,
      ...extra,
    });
  }

  function recoveryToken() {
    return jwt.sign({
      sub: 'u1',
      email: 'u@after.local',
      role: Role.USER,
      typ: ACCOUNT_RECOVERY_TYP,
    });
  }

  it('JWT antigo após invalidação é rejeitado', async () => {
    const invalidatedAt = new Date('2026-10-26T15:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.ACTIVE,
      sessionInvalidatedAt: invalidatedAt,
      sessionVersion: 0,
    });
    const token = jwt.sign({
      sub: 'u1',
      email: 'u@after.local',
      role: Role.USER,
      iat: Math.floor(new Date('2026-10-26T14:00:00.000Z').getTime() / 1000),
    });

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('conta PENDING_DELETION não usa API normal', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      sessionInvalidatedAt: null,
      sessionVersion: 1,
    });

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${sessionToken({ sv: 1 })}`)
      .expect(401);
  });

  it('recovery token não acessa rota normal', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      sessionInvalidatedAt: new Date(),
      sessionVersion: 2,
    });

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${recoveryToken()}`)
      .expect(401);
  });

  it('recovery token acessa cancelamento', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.PENDING_DELETION,
      sessionInvalidatedAt: new Date(Date.now() - 60_000),
      sessionVersion: 2,
    });
    users.cancelAccountDeletion.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .post('/users/me/deletion-cancel')
      .set('Authorization', `Bearer ${recoveryToken()}`)
      .expect(201);
    expect(users.cancelAccountDeletion).toHaveBeenCalledWith('u1');
  });

  it('session token não cancela exclusão', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.ACTIVE,
      sessionInvalidatedAt: null,
      sessionVersion: 0,
    });

    await request(app.getHttpServer())
      .post('/users/me/deletion-cancel')
      .set('Authorization', `Bearer ${sessionToken()}`)
      .expect(401);
  });

  it('JWT com sv desatualizado é rejeitado', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.ACTIVE,
      sessionInvalidatedAt: null,
      sessionVersion: 3,
    });

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${sessionToken({ sv: 2 })}`)
      .expect(401);
  });

  it('POST deletion-request agenda exclusão', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountLifecycleStatus.ACTIVE,
      sessionInvalidatedAt: null,
      sessionVersion: 0,
    });

    await request(app.getHttpServer())
      .post('/users/me/deletion-request')
      .set('Authorization', `Bearer ${sessionToken()}`)
      .expect(201);
    expect(users.requestAccountDeletion).toHaveBeenCalledWith('u1');
  });
});
