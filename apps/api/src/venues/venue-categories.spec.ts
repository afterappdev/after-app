import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { VenuesService } from './venues.service';
import {
  LEGACY_LIVE_MUSIC_CATEGORY,
  categoryMatches,
  storedCategory,
} from './venue-categories';

describe('venue categories', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20260928160000_categories_and_credit_coupons/migration.sql',
    ),
    'utf8',
  );

  it('grava o texto do app 1.0.1+11 e não reescreve categorias na migration', () => {
    expect(storedCategory('🍣 Culinária Asiática')).toBe(
      '🍣 Culinária Internacional',
    );
    expect(storedCategory('☕ Cafeterias e Padarias')).toBe(
      '☕ Cafeterias e Docerias',
    );
    expect(storedCategory('🎯 Jogos, Lazer e Diversão')).toBe(
      '🎯 Lazer e Diversão',
    );
    expect(storedCategory('⚽ Esportes, Lazer e Jogos')).toBe(
      '🎯 Lazer e Diversão',
    );
    expect(storedCategory('Esportes, Lazer e Jogos')).toBe(
      '🎯 Lazer e Diversão',
    );
    expect(storedCategory('🍔 Hamburguerias e Lanchonetes')).toBe(
      '🍔 Hamburguerias',
    );
    expect(storedCategory('🍔 Hamburguerias')).toBe('🍔 Hamburguerias');
    expect(storedCategory('🍴 Food Park')).toBe('🎡 Food Park');
    expect(storedCategory('🎤 Karaokê')).toBe('🎶 Karaokê');
    expect(storedCategory('🍦 Sorveterias e Açaí')).toBe(
      '🍨 Sorveterias e Açaí',
    );
    expect(storedCategory('🍢 Espetaria')).toBe('🍢 Espetaria');
    expect(storedCategory('🥟 Salgaderia')).toBe('🥟 Salgaderia');
    expect(storedCategory('🎉 Serv-Festas')).toBe('🎉 Serv-Festas');
    expect(storedCategory(LEGACY_LIVE_MUSIC_CATEGORY)).toBe(
      LEGACY_LIVE_MUSIC_CATEGORY,
    );
    expect(storedCategory('🎡 Food Park')).toBe('🎡 Food Park');
    expect(migration).not.toContain('UPDATE "Venue"');
    expect(migration).toContain('ON DELETE SET NULL');
    expect(migration).toContain('"venueNameSnapshot"');
    expect(migration).not.toMatch(
      /CreditCouponRedemption_venueId_fkey[\s\S]*ON DELETE CASCADE/,
    );
    expect(migration).not.toMatch(/SET "category".*Música ao Vivo/);
  });

  it('filtros reconhecem a categoria nova e o valor legado renomeado', () => {
    expect(
      categoryMatches('🍣 Culinária Internacional', '🍣 Culinária Asiática'),
    ).toBe(true);
    expect(categoryMatches('🎡 Food Park', '🎡 Food Park')).toBe(true);
    expect(categoryMatches('🎡 Food Park', '🍴 Food Park')).toBe(true);
    expect(categoryMatches('🎶 Karaokê', '🎤 Karaokê')).toBe(true);
    expect(
      categoryMatches('🍨 Sorveterias e Açaí', '🍦 Sorveterias e Açaí'),
    ).toBe(true);
    expect(
      categoryMatches('🎯 Lazer e Diversão', '⚽ Esportes, Lazer e Jogos'),
    ).toBe(true);
    expect(
      categoryMatches('🎯 Jogos, Lazer e Diversão', '⚽ Esportes, Lazer e Jogos'),
    ).toBe(true);
    expect(
      categoryMatches('🍔 Hamburguerias', '🍔 Hamburguerias e Lanchonetes'),
    ).toBe(true);
    expect(categoryMatches('🍢 Espetaria', '🍢 Espetaria')).toBe(true);
    expect(
      categoryMatches(LEGACY_LIVE_MUSIC_CATEGORY, '🎤 Casas de Show'),
    ).toBe(false);
    expect(categoryMatches(LEGACY_LIVE_MUSIC_CATEGORY, '🎤 Karaokê')).toBe(
      false,
    );
  });
});

describe('VenuesService search amenities and categories', () => {
  function setup() {
    const prisma = {
      venue: { findMany: jest.fn() },
      review: { groupBy: jest.fn().mockResolvedValue([]) },
      userVenueBlock: { findMany: jest.fn() },
    };
    const service = new VenuesService(
      prisma as never,
      { deleteStoredUpload: jest.fn(), deleteStoredUploads: jest.fn() } as unknown as MediaCleanupService,
    );
    return { prisma, service };
  }

  it('filtra categoria nova e comodidade nova sem tratar entrada como amenidade de lista', async () => {
    const { prisma, service } = setup();
    prisma.venue.findMany.mockResolvedValue([
      {
        id: 'a',
        name: 'Açaí da Praça',
        description: null,
        category: '🍨 Sorveterias e Açaí',
        logoUrl: null,
        coverUrl: null,
        city: 'São Paulo',
        state: 'SP',
        hoursJson: null,
        contacts: { hasWifi: true, hasCoverCharge: true, coverCharge: '20,00' },
      },
      {
        id: 'b',
        name: 'Bar Antigo',
        description: null,
        category: '🎵 Música ao Vivo',
        logoUrl: null,
        coverUrl: null,
        city: 'São Paulo',
        state: 'SP',
        hoursJson: null,
        contacts: { hasLiveMusic: true },
      },
    ]);

    const wifi = await service.searchByName('', { hasWifi: true });
    expect(wifi.map((item) => item.id)).toEqual(['a']);
    expect(wifi[0]).toEqual(
      expect.objectContaining({ hasWifi: true, hasLiveMusic: false }),
    );

    const asian = await service.searchByName('', {
      category: '🍣 Culinária Asiática',
    });
    expect(asian).toEqual([]);

    prisma.venue.findMany.mockResolvedValue([
      {
        id: 'c',
        name: 'Sushi',
        description: null,
        category: '🍣 Culinária Internacional',
        logoUrl: null,
        coverUrl: null,
        city: 'São Paulo',
        state: 'SP',
        hoursJson: null,
        contacts: {},
      },
    ]);
    const legacy = await service.searchByName('', {
      category: '🍣 Culinária Asiática',
    });
    expect(legacy.map((item) => item.id)).toEqual(['c']);

    prisma.venue.findMany.mockResolvedValue([
      {
        id: 'd',
        name: 'Quadra',
        description: null,
        category: '🎯 Lazer e Diversão',
        logoUrl: null,
        coverUrl: null,
        city: 'São Paulo',
        state: 'SP',
        hoursJson: null,
        contacts: {},
      },
      {
        id: 'e',
        name: 'Lanche',
        description: null,
        category: '🍔 Hamburguerias',
        logoUrl: null,
        coverUrl: null,
        city: 'São Paulo',
        state: 'SP',
        hoursJson: null,
        contacts: {},
      },
      {
        id: 'f',
        name: 'Espeto',
        description: null,
        category: '🍢 Espetaria',
        logoUrl: null,
        coverUrl: null,
        city: 'São Paulo',
        state: 'SP',
        hoursJson: null,
        contacts: {},
      },
    ]);

    const sports = await service.searchByName('', {
      category: '⚽ Esportes, Lazer e Jogos',
    });
    expect(sports.map((item) => item.id)).toEqual(['d']);
    const burgers = await service.searchByName('', {
      category: '🍔 Hamburguerias',
    });
    expect(burgers.map((item) => item.id)).toEqual(['e']);
    const skewers = await service.searchByName('', {
      category: '🍢 Espetaria',
    });
    expect(skewers.map((item) => item.id)).toEqual(['f']);
  });

  it('não apaga categoria de catálogo quando o cliente envia string vazia', async () => {
    const prisma = {
      venue: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'venue-1',
          ownerUserId: 'owner-1',
          category: '🍣 Culinária Asiática',
          city: 'São Paulo',
          state: 'SP',
          contacts: {},
          logoUrl: null,
          coverUrl: null,
        }),
        update: jest.fn().mockImplementation(async ({ data }) => data),
      },
    };
    const service = new VenuesService(
      prisma as never,
      { deleteStoredUpload: jest.fn(), deleteStoredUploads: jest.fn() } as unknown as MediaCleanupService,
    );

    await service.updateOwned('owner-1', 'venue-1', {
      name: 'Sushi',
      category: '',
      city: 'São Paulo',
      state: 'SP',
    });

    const data = prisma.venue.update.mock.calls[0][0].data;
    expect(data.category).toBeUndefined();
  });

  it('categoria nova enviada pelo app é gravada no texto que o 1.0.1+11 já conhece', async () => {
    const prisma = {
      venue: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'venue-1',
          ownerUserId: 'owner-1',
          category: '🍣 Culinária Internacional',
          city: 'São Paulo',
          state: 'SP',
          contacts: { hasWifi: true, phone: '11' },
          logoUrl: null,
          coverUrl: null,
        }),
        update: jest.fn().mockImplementation(async ({ data }) => data),
      },
    };
    const service = new VenuesService(
      prisma as never,
      { deleteStoredUpload: jest.fn(), deleteStoredUploads: jest.fn() } as unknown as MediaCleanupService,
    );

    await service.updateOwned('owner-1', 'venue-1', {
      category: '🍣 Culinária Asiática',
      contacts: { phone: '119999' },
    });

    const data = prisma.venue.update.mock.calls[0][0].data;
    expect(data.category).toBe('🍣 Culinária Internacional');
    expect(data.contacts).toEqual(
      expect.objectContaining({ hasWifi: true, phone: '119999' }),
    );
  });

  it('labels novos de esportes e hamburguerias continuam gravados no texto do 1.0.1+11', async () => {
    async function save(current: string, incoming: string) {
      const prisma = {
        venue: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'venue-1',
            ownerUserId: 'owner-1',
            category: current,
            city: 'São Paulo',
            state: 'SP',
            contacts: {},
            logoUrl: null,
            coverUrl: null,
          }),
          update: jest.fn().mockImplementation(async ({ data }) => data),
        },
      };
      const service = new VenuesService(
        prisma as never,
        { deleteStoredUpload: jest.fn(), deleteStoredUploads: jest.fn() } as unknown as MediaCleanupService,
      );
      await service.updateOwned('owner-1', 'venue-1', { category: incoming });
      return prisma.venue.update.mock.calls[0][0].data.category as string;
    }

    expect(
      await save('🎯 Lazer e Diversão', '⚽ Esportes, Lazer e Jogos'),
    ).toBe('🎯 Lazer e Diversão');
    expect(
      await save('🎯 Lazer e Diversão', '🎯 Jogos, Lazer e Diversão'),
    ).toBe('🎯 Lazer e Diversão');
    expect(
      await save('🍔 Hamburguerias', '🍔 Hamburguerias e Lanchonetes'),
    ).toBe('🍔 Hamburguerias');
    expect(await save('🍔 Hamburguerias', '🍔 Hamburguerias')).toBe(
      '🍔 Hamburguerias',
    );
    expect(await save('🎡 Food Park', '🍴 Food Park')).toBe('🎡 Food Park');
    expect(await save('🎶 Karaokê', '🎤 Karaokê')).toBe('🎶 Karaokê');
    expect(await save('🍨 Sorveterias e Açaí', '🍦 Sorveterias e Açaí')).toBe(
      '🍨 Sorveterias e Açaí',
    );
  });

  it('app 1.0.1+11 não apaga categoria nova que não reconhece', async () => {
    for (const category of ['🍢 Espetaria', '🥟 Salgaderia', '🎉 Serv-Festas']) {
      const prisma = {
        venue: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'venue-1',
            ownerUserId: 'owner-1',
            category,
            city: 'São Paulo',
            state: 'SP',
            contacts: { hasWifi: true },
            logoUrl: null,
            coverUrl: null,
          }),
          update: jest.fn().mockImplementation(async ({ data }) => data),
        },
      };
      const service = new VenuesService(
        prisma as never,
        { deleteStoredUpload: jest.fn(), deleteStoredUploads: jest.fn() } as unknown as MediaCleanupService,
      );

      await service.updateOwned('owner-1', 'venue-1', {
        name: 'Local',
        category: '',
        contacts: { phone: '119999' },
      });

      const data = prisma.venue.update.mock.calls[0][0].data;
      expect(data.category).toBeUndefined();
      expect(data.contacts).toEqual(
        expect.objectContaining({ hasWifi: true, phone: '119999' }),
      );
    }
  });

  it('Música ao Vivo legado exige uma categoria atual e não é convertida sozinha', async () => {
    const prisma = {
      venue: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'venue-1',
          ownerUserId: 'owner-1',
          category: LEGACY_LIVE_MUSIC_CATEGORY,
          city: 'São Paulo',
          state: 'SP',
          contacts: {},
          logoUrl: null,
          coverUrl: null,
        }),
        update: jest.fn().mockImplementation(async ({ data }) => data),
      },
    };
    const service = new VenuesService(
      prisma as never,
      { deleteStoredUpload: jest.fn(), deleteStoredUploads: jest.fn() } as unknown as MediaCleanupService,
    );

    await expect(
      service.updateOwned('owner-1', 'venue-1', { category: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.venue.update).not.toHaveBeenCalled();

    await service.updateOwned('owner-1', 'venue-1', {
      category: LEGACY_LIVE_MUSIC_CATEGORY,
    });
    expect(prisma.venue.update.mock.calls[0][0].data.category).toBe(
      LEGACY_LIVE_MUSIC_CATEGORY,
    );

    await service.updateOwned('owner-1', 'venue-1', {
      category: '🍻 Bares e Botecos',
    });
    expect(prisma.venue.update.mock.calls[1][0].data.category).toBe(
      '🍻 Bares e Botecos',
    );
  });

  it('outro estabelecimento não edita o local', async () => {
    const prisma = {
      venue: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'venue-1',
          ownerUserId: 'owner-1',
          category: '🍻 Bares e Botecos',
          city: 'São Paulo',
          state: 'SP',
          contacts: {},
        }),
        update: jest.fn(),
      },
    };
    const service = new VenuesService(
      prisma as never,
      { deleteStoredUpload: jest.fn() } as unknown as MediaCleanupService,
    );
    await expect(
      service.updateOwned('other', 'venue-1', { name: 'Hack' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.venue.update).not.toHaveBeenCalled();
  });
});
