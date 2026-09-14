import { geocodeCity, geocodeVenueProfile } from '../common/utils/geo';
import { HomeService } from './home.service';

jest.mock('../common/utils/geo', () => {
  const actual = jest.requireActual('../common/utils/geo');
  return {
    ...actual,
    geocodeCity: jest.fn(),
    geocodeVenueProfile: jest.fn(),
  };
});

const geocodeCityMock = geocodeCity as jest.MockedFunction<typeof geocodeCity>;
const geocodeVenueProfileMock = geocodeVenueProfile as jest.MockedFunction<
  typeof geocodeVenueProfile
>;

const SAVED_LAT = -23.5614;
const SAVED_LNG = -46.6559;
const USER_LAT = -23.55;
const USER_LNG = -46.63;

function venueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'venue-1',
    name: 'Bar Central',
    logoUrl: null,
    coverUrl: null,
    description: 'Bar',
    category: 'Bar',
    city: 'São Paulo',
    state: 'SP',
    lat: SAVED_LAT,
    lng: SAVED_LNG,
    hoursJson: { mon: { open: '10:00', close: '22:00' } },
    ...overrides,
  };
}

function createPrisma() {
  return {
    venue: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    bannerSchedule: {
      findMany: jest.fn(),
    },
  };
}

describe('HomeService geolocation', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: HomeService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new HomeService(prisma as never);
    geocodeCityMock.mockReset();
    geocodeVenueProfileMock.mockReset();
    geocodeCityMock.mockResolvedValue({ lat: -23.5505, lng: -46.6333 });
    geocodeVenueProfileMock.mockResolvedValue({ lat: -10, lng: -20 });
  });

  it('venues with saved lat/lng does not geocode or update coordinates', async () => {
    prisma.venue.findMany.mockResolvedValue([venueRow()]);

    const result = await service.venues(
      'São Paulo',
      String(USER_LAT),
      String(USER_LNG),
    );

    expect(geocodeVenueProfileMock).not.toHaveBeenCalled();
    expect(geocodeCityMock).not.toHaveBeenCalled();
    expect(prisma.venue.update).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].lat).toBe(SAVED_LAT);
    expect(result[0].lng).toBe(SAVED_LNG);
    expect(result[0].distanceKm).toEqual(expect.any(Number));
    expect(result[0].distanceKm).not.toBeNull();
  });

  it('venues without lat/lng leaves distanceKm null and does not geocode the venue', async () => {
    prisma.venue.findMany.mockResolvedValue([
      venueRow({ lat: null, lng: null }),
    ]);

    const result = await service.venues(
      'São Paulo',
      String(USER_LAT),
      String(USER_LNG),
    );

    expect(geocodeVenueProfileMock).not.toHaveBeenCalled();
    expect(prisma.venue.update).not.toHaveBeenCalled();
    expect(result[0].lat).toBeNull();
    expect(result[0].lng).toBeNull();
    expect(result[0].distanceKm).toBeNull();
  });

  it('promotions with saved lat/lng does not geocode or update coordinates', async () => {
    prisma.bannerSchedule.findMany.mockResolvedValue([
      {
        banner: {
          id: 'banner-1',
          imageUrl: 'https://example.com/banner.jpg',
          title: 'Promo',
          description: 'Happy hour',
          venue: venueRow(),
        },
        displayDate: new Date('2026-09-14T00:00:00.000Z'),
      },
    ]);

    const result = await service.promotions(
      'São Paulo',
      '2026-09-14',
      String(USER_LAT),
      String(USER_LNG),
    );

    expect(geocodeVenueProfileMock).not.toHaveBeenCalled();
    expect(prisma.venue.update).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].venue.lat).toBe(SAVED_LAT);
    expect(result[0].venue.lng).toBe(SAVED_LNG);
    expect(result[0].distanceKm).toEqual(expect.any(Number));
  });
});
