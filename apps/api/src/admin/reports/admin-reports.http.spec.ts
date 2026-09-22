import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesGuard } from '../guards/roles.guard';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';

describe('Admin reports HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const reports = {
    list: jest.fn(),
    getById: jest.fn(),
    moderate: jest.fn(),
    restoreVenue: jest.fn(),
  };
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
      controllers: [AdminReportsController],
      providers: [
        { provide: AdminReportsService, useValue: reports },
        JwtStrategy,
        RolesGuard,
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
    reports.list.mockReset();
    reports.getById.mockReset();
    reports.moderate.mockReset();
    reports.restoreVenue.mockReset();
    reports.list.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    reports.moderate.mockResolvedValue({
      id: 'r1',
      status: 'RESOLVED',
      reviewedBy: { id: 'id-ADMIN', name: 'Admin' },
      resolvedAt: '2026-09-22T12:00:00.000Z',
    });
  });

  function token(role: Role) {
    return jwt.sign({ sub: `id-${role}`, email: `${role}@after.local`, role });
  }

  it('GET /admin/reports sem token → 401', async () => {
    await request(app.getHttpServer()).get('/admin/reports').expect(401);
    expect(reports.list).not.toHaveBeenCalled();
  });

  it('GET /admin/reports com USER → 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/reports')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .expect(403);
    expect(reports.list).not.toHaveBeenCalled();
  });

  it('GET /admin/reports com VENUE → 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/reports')
      .set('Authorization', `Bearer ${token(Role.VENUE)}`)
      .expect(403);
  });

  it('GET /admin/reports com ADMIN lista denúncias', async () => {
    await request(app.getHttpServer())
      .get('/admin/reports')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(200);
    expect(reports.list).toHaveBeenCalled();
  });

  it('PATCH /admin/reports/:id ADMIN altera status com identidade do JWT', async () => {
    await request(app.getHttpServer())
      .patch('/admin/reports/r1')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .send({ status: 'RESOLVED', adminNote: 'Removido' })
      .expect(200);
    expect(reports.moderate).toHaveBeenCalledWith(
      'id-ADMIN',
      'r1',
      expect.objectContaining({ status: 'RESOLVED', adminNote: 'Removido' }),
    );
  });

  it('PATCH /admin/reports/:id USER não acessa moderação', async () => {
    await request(app.getHttpServer())
      .patch('/admin/reports/r1')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .send({ status: 'RESOLVED' })
      .expect(403);
    expect(reports.moderate).not.toHaveBeenCalled();
  });

  it('PATCH /admin/reports/:id rejeita campos administrativos do cliente', async () => {
    await request(app.getHttpServer())
      .patch('/admin/reports/r1')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .send({
        status: 'RESOLVED',
        reviewedById: 'spoof-admin',
        reporterId: 'spoof-user',
        resolvedAt: '2020-01-01T00:00:00.000Z',
      })
      .expect(400);
    expect(reports.moderate).not.toHaveBeenCalled();
  });

  it('POST /admin/reports/:id/restore-venue sem token → 401', async () => {
    await request(app.getHttpServer())
      .post('/admin/reports/r1/restore-venue')
      .expect(401);
    expect(reports.restoreVenue).not.toHaveBeenCalled();
  });

  it('POST /admin/reports/:id/restore-venue USER → 403', async () => {
    await request(app.getHttpServer())
      .post('/admin/reports/r1/restore-venue')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .expect(403);
    expect(reports.restoreVenue).not.toHaveBeenCalled();
  });

  it('POST /admin/reports/:id/restore-venue ADMIN restaura com identidade do JWT', async () => {
    reports.restoreVenue.mockResolvedValue({
      id: 'r1',
      status: 'RESOLVED',
      venueHidden: false,
      contentRestoredBy: { id: 'id-ADMIN', name: 'Admin' },
    });
    await request(app.getHttpServer())
      .post('/admin/reports/r1/restore-venue')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(200);
    expect(reports.restoreVenue).toHaveBeenCalledWith('id-ADMIN', 'r1');
  });
});
