import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { RolesGuard } from './guards/roles.guard';

describe('Admin HTTP guards', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const dashboard = { getDashboard: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [AdminDashboardController],
      providers: [
        { provide: AdminDashboardService, useValue: dashboard },
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
    dashboard.getDashboard.mockReset();
    dashboard.getDashboard.mockResolvedValue({ ok: true });
  });

  function token(role: Role) {
    return jwt.sign({ sub: `id-${role}`, email: `${role}@after.local`, role });
  }

  it('GET /admin/dashboard sem token → 401', async () => {
    await request(app.getHttpServer()).get('/admin/dashboard').expect(401);
    expect(dashboard.getDashboard).not.toHaveBeenCalled();
  });

  it('GET /admin/dashboard com USER → 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${token(Role.USER)}`)
      .expect(403);
    expect(dashboard.getDashboard).not.toHaveBeenCalled();
  });

  it('GET /admin/dashboard com VENUE → 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${token(Role.VENUE)}`)
      .expect(403);
    expect(dashboard.getDashboard).not.toHaveBeenCalled();
  });

  it('GET /admin/dashboard com ADMIN → 200', async () => {
    await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${token(Role.ADMIN)}`)
      .expect(200);
    expect(dashboard.getDashboard).toHaveBeenCalled();
  });

  it('token sem role não autentica', async () => {
    const raw = jwt.sign({ sub: 'x', email: 'x@after.local' });
    const res = await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${raw}`);
    expect([401, 403]).toContain(res.status);
    expect(dashboard.getDashboard).not.toHaveBeenCalled();
  });
});
