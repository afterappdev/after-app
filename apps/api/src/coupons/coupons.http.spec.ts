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
import { CouponRedeemController } from './coupons.controller';
import { CouponsService } from './coupons.service';

describe('POST /credits/coupons/redeem', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const coupons = { redeem: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [CouponRedeemController],
      providers: [
        { provide: CouponsService, useValue: coupons },
        JwtStrategy,
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn(async () => ({ id: 'u' })) } } },
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
    coupons.redeem.mockReset();
    coupons.redeem.mockResolvedValue({ code: 'AFTER2', creditAmount: 2, balance: 4 });
  });

  function token(role: Role) {
    return jwt.sign({ sub: `id-${role}`, email: `${role}@after.local`, role });
  }

  it('sem token → 401', async () => {
    await request(app.getHttpServer())
      .post('/credits/coupons/redeem')
      .send({ code: 'AFTER2' })
      .expect(401);
    expect(coupons.redeem).not.toHaveBeenCalled();
  });

  it('rejeita campo de créditos enviado pelo cliente', async () => {
    await request(app.getHttpServer())
      .post('/credits/coupons/redeem')
      .set('Authorization', `Bearer ${token(Role.VENUE)}`)
      .send({ code: 'AFTER2', creditAmount: 99 })
      .expect(400);
    expect(coupons.redeem).not.toHaveBeenCalled();
  });

  it('estabelecimento envia somente o código', async () => {
    await request(app.getHttpServer())
      .post('/credits/coupons/redeem')
      .set('Authorization', `Bearer ${token(Role.VENUE)}`)
      .send({ code: 'AFTER2' })
      .expect(201);
    expect(coupons.redeem).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'VENUE', userId: 'id-VENUE' }),
      'AFTER2',
    );
  });
});
