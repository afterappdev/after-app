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
import { AdminSalesController } from './admin-sales.controller';
import { AdminSalesService } from './admin-sales.service';

describe('Admin sales HTTP guards', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const sales = {
    list: jest.fn(),
    getById: jest.fn(),
    monthly: jest.fn(),
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
      controllers: [AdminSalesController],
      providers: [
        { provide: AdminSalesService, useValue: sales },
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
    sales.list.mockReset();
    sales.getById.mockReset();
    sales.list.mockResolvedValue({ items: [] });
    sales.getById.mockResolvedValue({ id: 'sale-1' });
  });

  function token(role: Role) {
    return jwt.sign({ sub: `id-${role}`, email: `${role}@after.local`, role });
  }

  it('GET /admin/sales sem token → 401', async () => {
    await request(app.getHttpServer()).get('/admin/sales').expect(401);
    expect(sales.list).not.toHaveBeenCalled();
  });

  it.each([Role.USER, Role.VENUE])(
    'GET /admin/sales com %s → 403',
    async (role) => {
      await request(app.getHttpServer())
        .get('/admin/sales')
        .set('Authorization', `Bearer ${token(role)}`)
        .expect(403);
      expect(sales.list).not.toHaveBeenCalled();
    },
  );

  it.each([Role.USER, Role.VENUE])(
    'GET /admin/sales/:id com %s → 403',
    async (role) => {
      await request(app.getHttpServer())
        .get('/admin/sales/sale-1')
        .set('Authorization', `Bearer ${token(role)}`)
        .expect(403);
      expect(sales.getById).not.toHaveBeenCalled();
    },
  );

  it('ADMIN consulta o histórico e o detalhe', async () => {
    await request(app.getHttpServer())
      .get('/admin/sales')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/admin/sales/sale-1')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(200);
    expect(sales.list).toHaveBeenCalled();
    expect(sales.getById).toHaveBeenCalled();
  });
});
