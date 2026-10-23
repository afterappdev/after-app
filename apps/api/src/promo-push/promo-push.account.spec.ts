import { BadRequestException } from '@nestjs/common';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromoPushAccountService } from './promo-push.account';

describe('PromoPushAccountService', () => {
  const tokens = new Map<string, { id: string; userId: string; token: string; platform: string; disabledAt: Date | null; updatedAt: Date }>();
  const users = new Map<string, Record<string, unknown>>();
  const locations = {
    resolveMunicipalityId: jest.fn(async (city: string, state: string) =>
      city === 'São Paulo' && state === 'SP' ? 3550308 : null,
    ),
    hasMunicipality: jest.fn(async (id: number) => id === 3550308),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const current = users.get(where.id);
        if (!current) return null;
        Object.assign(current, data);
        return current;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string; ibgeCityId: null }; data: { ibgeCityId: number } }) => {
        const current = users.get(where.id);
        if (!current || current.ibgeCityId != null) return { count: 0 };
        current.ibgeCityId = data.ibgeCityId;
        return { count: 1 };
      }),
    },
    devicePushToken: {
      upsert: jest.fn(async ({ where, create, update }: { where: { token: string }; create: { userId: string; token: string; platform: string }; update: { userId: string; platform: string; disabledAt: null } }) => {
        const current = tokens.get(where.token);
        if (!current) {
          const row = {
            id: `tok-${tokens.size + 1}`,
            userId: create.userId,
            token: create.token,
            platform: create.platform,
            disabledAt: null,
            updatedAt: new Date(),
          };
          tokens.set(where.token, row);
          return row;
        }
        current.userId = update.userId;
        current.platform = update.platform;
        current.disabledAt = null;
        current.updatedAt = new Date();
        return current;
      }),
      findUnique: jest.fn(async ({ where }: { where: { token: string } }) => tokens.get(where.token) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { disabledAt: Date } }) => {
        const row = [...tokens.values()].find((item) => item.id === where.id);
        if (row) row.disabledAt = data.disabledAt;
        return row;
      }),
    },
  };

  const service = new PromoPushAccountService(
    prisma as unknown as PrismaService,
    locations as unknown as LocationsService,
  );

  beforeEach(() => {
    tokens.clear();
    users.clear();
    users.set('user-a', {
      id: 'user-a',
      city: 'São Paulo',
      state: 'SP',
      ibgeCityId: null,
      promoNotificationsEnabled: false,
      lastAuthorizedIbgeCityId: null,
      lastAuthorizedCityAt: null,
    });
  });

  it('começa desligado e preenche o IBGE da cidade cadastrada', async () => {
    const prefs = await service.getPreferences('user-a');
    expect(prefs.enabled).toBe(false);
    expect(prefs.ibgeCityId).toBe(3550308);
    expect(prefs.locationFresh).toBe(false);
  });

  it('ativa e desativa o consentimento sem mexer na permissão do sistema', async () => {
    expect((await service.setEnabled('user-a', true)).enabled).toBe(true);
    expect((await service.setEnabled('user-a', false)).enabled).toBe(false);
  });

  it('grava a última cidade autorizada e recusa homônimo sem UF confiável', async () => {
    const saved = await service.setLocation('user-a', {
      city: 'São Paulo',
      state: 'SP',
    });
    expect(saved.lastAuthorizedIbgeCityId).toBe(3550308);
    expect(saved.locationFresh).toBe(true);
    await expect(
      service.setLocation('user-a', { city: 'Bom Jesus', state: 'SP' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('move o token para a conta seguinte e o logout só desativa', async () => {
    users.set('user-b', {
      id: 'user-b',
      city: 'São Paulo',
      state: 'SP',
      ibgeCityId: 3550308,
      promoNotificationsEnabled: false,
      lastAuthorizedIbgeCityId: null,
      lastAuthorizedCityAt: null,
    });
    const token = 'fcm-token-abcdefgh';
    await service.registerToken('user-a', token, 'android');
    await service.unregisterToken('user-a', token);
    expect(tokens.get(token)?.disabledAt).toBeInstanceOf(Date);
    expect(tokens.get(token)?.userId).toBe('user-a');
    const moved = await service.registerToken('user-b', token, 'web');
    expect(moved.platform).toBe('web');
    expect(moved).not.toHaveProperty('token');
    expect(tokens.get(token)?.userId).toBe('user-b');
    expect(tokens.get(token)?.disabledAt).toBeNull();
  });
});
