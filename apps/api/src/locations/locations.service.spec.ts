import { LocationsService } from './locations.service';

describe('LocationsService', () => {
  it('listStates serves snapshot when IBGE is unreachable', async () => {
    const service = new LocationsService().useIbgeDeps({
      fetchFn: async () => {
        throw new TypeError('fetch failed');
      },
      retries: 0,
    });

    const states = await service.listStates();
    expect(states.length).toBe(27);
    expect(states.some((s) => s.uf === 'SP')).toBe(true);
  });

  it('listCities returns SP municipalities from snapshot on network failure', async () => {
    const service = new LocationsService().useIbgeDeps({
      fetchFn: async () => {
        throw new TypeError('fetch failed');
      },
      retries: 0,
    });

    const cities = await service.listCities('SP');
    expect(cities.length).toBeGreaterThan(100);
    expect(cities[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
  });
});
