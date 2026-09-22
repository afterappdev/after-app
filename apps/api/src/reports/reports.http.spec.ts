import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('Reports HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const reports = { create: jest.fn() };
  const prisma = {
    user: {
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id ? { id: args.where.id } : null,
      ),
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: reports },
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'test-secret' },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    reports.create.mockReset();
    reports.create.mockResolvedValue({ id: 'r1', status: 'PENDING' });
  });

  function token(role: Role, sub = `id-${role}`) {
    return jwt.sign({ sub, email: `${role}@after.local`, role });
  }

  it('POST /reports sem autenticação → 401', async () => {
    await request(app.getHttpServer())
      .post('/reports')
      .send({
        targetType: 'VENUE',
        targetId: 'venue-1',
        reason: 'SPAM',
      })
      .expect(401);
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('POST /reports USER denuncia conteúdo válido', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${token(Role.USER, 'user-1')}`)
      .send({
        targetType: 'VENUE',
        targetId: 'venue-1',
        reason: 'SPAM',
      })
      .expect(201);

    expect(res.body).toEqual({ id: 'r1', status: 'PENDING' });
    expect(reports.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', role: 'USER' }),
      expect.objectContaining({
        targetType: 'VENUE',
        targetId: 'venue-1',
        reason: 'SPAM',
      }),
    );
  });

  it('POST /reports motivo inválido → 400', async () => {
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .send({
        targetType: 'VENUE',
        targetId: 'venue-1',
        reason: 'NOT_A_REASON',
      })
      .expect(400);
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('POST /reports ignora userId enviado pelo cliente', async () => {
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${token(Role.USER, 'user-1')}`)
      .send({
        targetType: 'VENUE',
        targetId: 'venue-1',
        reason: 'SPAM',
        userId: 'other-user',
        reporterId: 'other-user',
      })
      .expect(400);
    expect(reports.create).not.toHaveBeenCalled();
  });
});
