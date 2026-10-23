import { UsersService } from './users.service';
import { LocationsService } from '../locations/locations.service';

describe('UsersService IBGE city', () => {
  it('atualiza o código quando cidade e UF identificam um município', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-1',
          avatarUrl: null,
          city: 'Campinas',
          state: 'SP',
        })),
        update: jest.fn(async ({ data }: { data: { ibgeCityId: number } }) => ({
          id: 'user-1',
          name: 'Ana',
          email: 'ana@after.local',
          role: 'USER',
          state: 'SP',
          city: 'São Paulo',
          avatarUrl: null,
          ibgeCityId: data.ibgeCityId,
        })),
      },
    };
    const locations = {
      resolveMunicipalityId: jest.fn(async () => 3550308),
    };
    const service = new UsersService(
      prisma as never,
      { deleteStoredUpload: jest.fn() } as never,
      { revokeForAccount: jest.fn() } as never,
      locations as unknown as LocationsService,
    );

    await service.updateMe('user-1', { city: 'São Paulo', state: 'SP' });

    expect(locations.resolveMunicipalityId).toHaveBeenCalledWith('São Paulo', 'SP');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ibgeCityId: 3550308 }),
      }),
    );
  });

  it('limpa o código quando a cidade deixa de ser identificável', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-1',
          avatarUrl: null,
          city: 'São Paulo',
          state: 'SP',
        })),
        update: jest.fn(async () => ({
          id: 'user-1',
          name: 'Ana',
          email: 'ana@after.local',
          role: 'USER',
          state: 'SP',
          city: 'Bom Jesus',
          avatarUrl: null,
        })),
      },
    };
    const locations = {
      resolveMunicipalityId: jest.fn(async () => null),
    };
    const service = new UsersService(
      prisma as never,
      { deleteStoredUpload: jest.fn() } as never,
      { revokeForAccount: jest.fn() } as never,
      locations as unknown as LocationsService,
    );

    await service.updateMe('user-1', { city: 'Bom Jesus', state: 'SP' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ibgeCityId: null }),
      }),
    );
  });
});
