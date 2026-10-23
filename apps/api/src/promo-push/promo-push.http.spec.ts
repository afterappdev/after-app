import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { PromoPushAccountService } from './promo-push.account';
import { PromoPushController } from './promo-push.controller';

describe('promo notification HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const account = {
    getPreferences: jest.fn(),
    setEnabled: jest.fn(),
    setLocation: jest.fn(),
    registerToken: jest.fn(),
    unregisterToken: jest.fn(),
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
      controllers: [PromoPushController],
      providers: [
        { provide: PromoPushAccountService, useValue: account },
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { getOrThrow: () => 'test-secret' } },
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
    jest.clearAllMocks();
    account.getPreferences.mockResolvedValue({ enabled: false });
    account.setEnabled.mockResolvedValue({ enabled: true });
    account.setLocation.mockResolvedValue({ lastAuthorizedIbgeCityId: 3550308 });
    account.registerToken.mockResolvedValue({ id: 'tok-1', platform: 'web' });
    account.unregisterToken.mockResolvedValue({ removed: true });
  });

  function bearer() {
    return jwt.sign({
      sub: 'user-1',
      email: 'user@after.local',
      role: 'USER',
    });
  }

  it('exige autenticação', async () => {
    await request(app.getHttpServer()).get('/promo-notifications/preferences').expect(401);
  });

  it('consulta e altera a preferência', async () => {
    await request(app.getHttpServer())
      .get('/promo-notifications/preferences')
      .set('Authorization', `Bearer ${bearer()}`)
      .expect(200);
    await request(app.getHttpServer())
      .put('/promo-notifications/preferences')
      .set('Authorization', `Bearer ${bearer()}`)
      .send({ enabled: true })
      .expect(200);
    expect(account.setEnabled).toHaveBeenCalledWith('user-1', true);
  });

  it('recusa coordenada no corpo da localização', async () => {
    await request(app.getHttpServer())
      .put('/promo-notifications/location')
      .set('Authorization', `Bearer ${bearer()}`)
      .send({ ibgeCityId: 3550308, lat: -23.5, lng: -46.6 })
      .expect(400);
    expect(account.setLocation).not.toHaveBeenCalled();
  });

  it('aceita token web e recusa plataforma desconhecida', async () => {
    await request(app.getHttpServer())
      .post('/promo-notifications/tokens')
      .set('Authorization', `Bearer ${bearer()}`)
      .send({ token: 'fcm-token-abcdefgh', platform: 'web' })
      .expect(201);
    expect(account.registerToken).toHaveBeenCalledWith(
      'user-1',
      'fcm-token-abcdefgh',
      'web',
    );
    await request(app.getHttpServer())
      .post('/promo-notifications/tokens')
      .set('Authorization', `Bearer ${bearer()}`)
      .send({ token: 'fcm-token-abcdefgh', platform: 'desktop' })
      .expect(400);
  });

  it('desvincula o token no logout', async () => {
    await request(app.getHttpServer())
      .delete('/promo-notifications/tokens')
      .set('Authorization', `Bearer ${bearer()}`)
      .send({ token: 'fcm-token-abcdefgh' })
      .expect(200);
    expect(account.unregisterToken).toHaveBeenCalledWith('user-1', 'fcm-token-abcdefgh');
  });
});
