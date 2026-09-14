import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtStrategy } from '../auth/jwt.strategy';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

describe('Venues geocode HTTP', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const venues = {
    geocodeLookup: jest.fn(),
    listByCity: jest.fn(),
    searchByName: jest.fn(),
    listReviews: jest.fn(),
    getPublic: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [VenuesController],
      providers: [
        { provide: VenuesService, useValue: venues },
        JwtStrategy,
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
    venues.geocodeLookup.mockReset();
    venues.geocodeLookup.mockResolvedValue({
      lat: -20.811234,
      lng: -49.375678,
    });
  });

  function token() {
    return jwt.sign({
      sub: 'venue-owner',
      email: 'local@after.local',
      role: 'VENUE',
    });
  }

  it('GET /venues/geocode sem token → 401', async () => {
    await request(app.getHttpServer())
      .get('/venues/geocode')
      .query({ address: 'Rua A', city: 'São Paulo', state: 'SP' })
      .expect(401);
    expect(venues.geocodeLookup).not.toHaveBeenCalled();
  });

  it('GET /venues/geocode autenticado retorna lat/lng', async () => {
    const res = await request(app.getHttpServer())
      .get('/venues/geocode')
      .set('Authorization', `Bearer ${token()}`)
      .query({
        address: 'Rua das Flores, 100',
        city: 'São José do Rio Preto',
        state: 'SP',
      })
      .expect(200);

    expect(res.body).toEqual({ lat: -20.811234, lng: -49.375678 });
    expect(venues.geocodeLookup).toHaveBeenCalledWith({
      address: 'Rua das Flores, 100',
      city: 'São José do Rio Preto',
      state: 'SP',
    });
  });

  it('GET /venues/geocode sem endereço → 400', async () => {
    await request(app.getHttpServer())
      .get('/venues/geocode')
      .set('Authorization', `Bearer ${token()}`)
      .query({ city: 'São Paulo' })
      .expect(400);
    expect(venues.geocodeLookup).not.toHaveBeenCalled();
  });
});
