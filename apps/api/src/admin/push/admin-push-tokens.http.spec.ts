import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { RolesGuard } from '../guards/roles.guard';
import { AdminPushTokensController } from './admin-push-tokens.controller';
import { AdminPushTokensService } from './admin-push-tokens.service';

describe('Admin push token HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const tokens = {
    register: jest.fn(),
    unregister: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [AdminPushTokensController],
      providers: [
        { provide: AdminPushTokensService, useValue: tokens },
        JwtStrategy,
        RolesGuard,
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
    tokens.register.mockReset();
    tokens.unregister.mockReset();
    tokens.register.mockResolvedValue({ id: 'tok-1', platform: 'android' });
    tokens.unregister.mockResolvedValue({ removed: true });
  });

  function token(role: Role) {
    return jwt.sign({ sub: `id-${role}`, email: `${role}@after.local`, role });
  }

  const body = { token: 'fcm-token-abcdefgh', platform: 'android' };

  it('USER não registra push token', async () => {
    await request(app.getHttpServer())
      .post('/admin/push-tokens')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .send(body)
      .expect(403);
    expect(tokens.register).not.toHaveBeenCalled();
  });

  it('VENUE não registra push token', async () => {
    await request(app.getHttpServer())
      .post('/admin/push-tokens')
      .set('Authorization', `Bearer ${token(Role.VENUE)}`)
      .send(body)
      .expect(403);
    expect(tokens.register).not.toHaveBeenCalled();
  });

  it('ADMIN registra push token', async () => {
    await request(app.getHttpServer())
      .post('/admin/push-tokens')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .send(body)
      .expect(201);
    expect(tokens.register).toHaveBeenCalledWith(
      'id-ADMIN',
      'fcm-token-abcdefgh',
      'android',
    );
  });

  it('ADMIN remove push token no logout', async () => {
    await request(app.getHttpServer())
      .delete('/admin/push-tokens')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .send({ token: 'fcm-token-abcdefgh' })
      .expect(200);
    expect(tokens.unregister).toHaveBeenCalledWith(
      'id-ADMIN',
      'fcm-token-abcdefgh',
    );
  });

  it('USER não remove push token', async () => {
    await request(app.getHttpServer())
      .delete('/admin/push-tokens')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .send({ token: 'fcm-token-abcdefgh' })
      .expect(403);
    expect(tokens.unregister).not.toHaveBeenCalled();
  });
});
