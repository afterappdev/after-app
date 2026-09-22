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
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('Blocked venues HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const users = {
    getMe: jest.fn(),
    updateMe: jest.fn(),
    changePassword: jest.fn(),
    deleteAccount: jest.fn(),
    listBlockedVenues: jest.fn(),
    blockVenue: jest.fn(),
    unblockVenue: jest.fn(),
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
    users.listBlockedVenues.mockReset();
    users.blockVenue.mockReset();
    users.unblockVenue.mockReset();
    users.listBlockedVenues.mockResolvedValue([]);
    users.blockVenue.mockResolvedValue({
      id: 'b1',
      venueId: 'venue-1',
      venue: { id: 'venue-1', name: 'Bar Central' },
    });
    users.unblockVenue.mockResolvedValue({ ok: true });
  });

  function token(role: Role, sub = `id-${role}`) {
    return jwt.sign({ sub, email: `${role}@after.local`, role });
  }

  it('GET /users/me/blocked-venues sem token → 401', async () => {
    await request(app.getHttpServer())
      .get('/users/me/blocked-venues')
      .expect(401);
    expect(users.listBlockedVenues).not.toHaveBeenCalled();
  });

  it('POST /users/me/blocked-venues/:id USER bloqueia', async () => {
    await request(app.getHttpServer())
      .post('/users/me/blocked-venues/venue-1')
      .set('Authorization', `Bearer ${token(Role.USER, 'user-1')}`)
      .expect(201);
    expect(users.blockVenue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', role: 'USER' }),
      'venue-1',
    );
  });

  it('DELETE /users/me/blocked-venues/:id USER desbloqueia', async () => {
    await request(app.getHttpServer())
      .delete('/users/me/blocked-venues/venue-1')
      .set('Authorization', `Bearer ${token(Role.USER, 'user-1')}`)
      .expect(200);
    expect(users.unblockVenue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'venue-1',
    );
  });
});
