import {
  BadRequestException,
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('Users HTTP account deletion', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const users = {
    deleteAccount: jest.fn(),
    getMe: jest.fn(),
    updateMe: jest.fn(),
    changePassword: jest.fn(),
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
    users.deleteAccount.mockReset();
    users.deleteAccount.mockResolvedValue({ ok: true });
    prisma.user.findUnique.mockReset();
    prisma.user.findUnique.mockImplementation(
      async (args: { where: { id: string } }) =>
        args.where.id ? { id: args.where.id } : null,
    );
  });

  function token(role: Role, id = `id-${role}`) {
    return jwt.sign({ sub: id, email: `${role.toLowerCase()}@after.local`, role });
  }

  it('DELETE /users/me USER exclui a conta', async () => {
    const res = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token(Role.USER, 'u-user')}`)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(users.deleteAccount).toHaveBeenCalledWith('u-user');
  });

  it('DELETE /users/me VENUE exclui a conta', async () => {
    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token(Role.VENUE, 'u-venue')}`)
      .expect(200);
    expect(users.deleteAccount).toHaveBeenCalledWith('u-venue');
  });

  it('DELETE /users/me ADMIN é recusado', async () => {
    users.deleteAccount.mockRejectedValue(
      new BadRequestException(
        'Conta administrativa não pode ser excluída por este fluxo.',
      ),
    );
    const res = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token(Role.ADMIN, 'u-admin')}`)
      .expect(400);
    expect(res.body.message).toBe(
      'Conta administrativa não pode ser excluída por este fluxo.',
    );
  });

  it('DELETE /users/me com JWT de conta excluída → 401', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token(Role.USER, 'deleted')}`)
      .expect(401);
    expect(users.deleteAccount).not.toHaveBeenCalled();
  });

  it('DELETE /users/me sem token → 401', async () => {
    await request(app.getHttpServer()).delete('/users/me').expect(401);
    expect(users.deleteAccount).not.toHaveBeenCalled();
  });

  it('DELETE /users/me com Apple indisponível → 503 e não vaza token', async () => {
    users.deleteAccount.mockRejectedValue(
      new ServiceUnavailableException(
        'Não foi possível concluir a exclusão agora. Tente novamente em instantes.',
      ),
    );
    const res = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token(Role.USER, 'u-apple')}`)
      .expect(503);
    expect(JSON.stringify(res.body)).not.toContain('refresh_token');
    expect(res.body.message).toBe(
      'Não foi possível concluir a exclusão agora. Tente novamente em instantes.',
    );
  });
});
