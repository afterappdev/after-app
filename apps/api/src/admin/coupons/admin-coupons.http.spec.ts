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
import { CouponsService } from '../../coupons/coupons.service';
import { RolesGuard } from '../guards/roles.guard';
import { AdminCouponsController } from './admin-coupons.controller';

describe('Admin coupons HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const coupons = {
    list: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [AdminCouponsController],
      providers: [
        { provide: CouponsService, useValue: coupons },
        JwtStrategy,
        RolesGuard,
        {
          provide: PrismaService,
          useValue: { user: { findUnique: jest.fn(async () => ({ id: 'u' })) } },
        },
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
    coupons.list.mockReset();
    coupons.list.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  function token(role: Role) {
    return jwt.sign({ sub: `id-${role}`, email: `${role}@after.local`, role });
  }

  it('sem token → 401', async () => {
    await request(app.getHttpServer()).get('/admin/coupons').expect(401);
    expect(coupons.list).not.toHaveBeenCalled();
  });

  it.each([Role.USER, Role.VENUE])('%s não administra cupom', async (role) => {
    await request(app.getHttpServer())
      .get('/admin/coupons')
      .set('Authorization', `Bearer ${token(role)}`)
      .expect(403);
    expect(coupons.list).not.toHaveBeenCalled();
  });

  it('admin lista cupons', async () => {
    await request(app.getHttpServer())
      .get('/admin/coupons')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(200);
    expect(coupons.list).toHaveBeenCalled();
  });

  it('admin não cria cupom com créditos inválidos', async () => {
    await request(app.getHttpServer())
      .post('/admin/coupons')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .send({ code: 'AFTER2', creditAmount: 0 })
      .expect(400);
    expect(coupons.create).not.toHaveBeenCalled();
  });
});
