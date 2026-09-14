import {
  BadRequestException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { RolesGuard } from '../guards/roles.guard';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';

describe('Admin accounts HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const accounts = {
    list: jest.fn(),
    getById: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [AdminAccountsController],
      providers: [
        { provide: AdminAccountsService, useValue: accounts },
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
    accounts.list.mockReset();
    accounts.getById.mockReset();
    accounts.remove.mockReset();
    accounts.remove.mockResolvedValue({ success: true });
  });

  function token(role: Role) {
    return jwt.sign({ sub: `id-${role}`, email: `${role}@after.local`, role });
  }

  it('DELETE /admin/accounts/:id sem autenticação → 401', async () => {
    await request(app.getHttpServer())
      .delete('/admin/accounts/u1')
      .expect(401);
    expect(accounts.remove).not.toHaveBeenCalled();
  });

  it('DELETE /admin/accounts/:id com USER → 403', async () => {
    await request(app.getHttpServer())
      .delete('/admin/accounts/u1')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .expect(403);
    expect(accounts.remove).not.toHaveBeenCalled();
  });

  it('DELETE /admin/accounts/:id com ADMIN exclui USER', async () => {
    const res = await request(app.getHttpServer())
      .delete('/admin/accounts/u-user')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(200);
    expect(res.body).toEqual({ success: true });
    expect(accounts.remove).toHaveBeenCalledWith('u-user');
  });

  it('DELETE /admin/accounts/:id conta inexistente → 404', async () => {
    accounts.remove.mockRejectedValue(
      new NotFoundException('Conta não encontrada'),
    );
    await request(app.getHttpServer())
      .delete('/admin/accounts/missing')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(404);
  });

  it('DELETE /admin/accounts/:id tentativa de excluir ADMIN → 400', async () => {
    accounts.remove.mockRejectedValue(
      new BadRequestException('Conta administrativa não pode ser excluída.'),
    );
    const res = await request(app.getHttpServer())
      .delete('/admin/accounts/u-admin')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(400);
    expect(res.body.message).toBe('Conta administrativa não pode ser excluída.');
  });
});
