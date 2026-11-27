import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
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
import { AdminVenueProfileController } from './admin-venue-profile.controller';
import { AdminVenueProfileService } from './admin-venue-profile.service';

describe('Admin venue profile HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const profiles = {
    get: jest.fn(),
    save: jest.fn(),
    addPhoto: jest.fn(),
    removePhoto: jest.fn(),
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
      controllers: [AdminVenueProfileController],
      providers: [
        { provide: AdminVenueProfileService, useValue: profiles },
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
    profiles.get.mockReset();
    profiles.save.mockReset();
    profiles.addPhoto.mockReset();
    profiles.removePhoto.mockReset();
    profiles.get.mockResolvedValue({ id: 'v1', name: 'Bar' });
    profiles.save.mockResolvedValue({ id: 'v1', name: 'Bar Novo' });
  });

  function token(role: Role) {
    return jwt.sign({ sub: `id-${role}`, email: `${role}@after.local`, role });
  }

  it('GET /admin/venues/:id/profile sem autenticação → 401', async () => {
    await request(app.getHttpServer()).get('/admin/venues/v1/profile').expect(401);
    expect(profiles.get).not.toHaveBeenCalled();
  });

  it('GET /admin/venues/:id/profile com USER → 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/venues/v1/profile')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .expect(403);
    expect(profiles.get).not.toHaveBeenCalled();
  });

  it('PATCH /admin/venues/:id/profile com ADMIN grava o perfil', async () => {
    const res = await request(app.getHttpServer())
      .patch('/admin/venues/v1/profile')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .send({
        name: 'Bar Novo',
        contacts: { address: 'Rua A, 10', phone: '119999' },
        hoursJson: { mon: { open: '18:00', close: '23:00' } },
        menuUrl: 'https://cardapio.example',
      })
      .expect(200);

    expect(res.body).toEqual({ id: 'v1', name: 'Bar Novo' });
    expect(profiles.save).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        name: 'Bar Novo',
        menuUrl: 'https://cardapio.example',
      }),
    );
  });

  it('PATCH recusa campo fora do perfil público', async () => {
    await request(app.getHttpServer())
      .patch('/admin/venues/v1/profile')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .send({ name: 'Bar', documentDigits: '123' })
      .expect(400);
    expect(profiles.save).not.toHaveBeenCalled();
  });

  it('POST foto com ADMIN', async () => {
    profiles.addPhoto.mockResolvedValue({ id: 'p1' });
    await request(app.getHttpServer())
      .post('/admin/venues/v1/photos')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .send({ url: 'https://cdn.example/foto.jpg', kind: 'GALLERY' })
      .expect(201);
    expect(profiles.addPhoto).toHaveBeenCalledWith(
      'v1',
      'https://cdn.example/foto.jpg',
      'GALLERY',
      undefined,
    );
  });

  it('DELETE foto inexistente → 404', async () => {
    profiles.removePhoto.mockRejectedValue(
      new NotFoundException('Foto não encontrada'),
    );
    await request(app.getHttpServer())
      .delete('/admin/venues/v1/photos/missing')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(404);
  });
});
