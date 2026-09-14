import { geocodeCity, geocodeVenueProfile } from '../common/utils/geo';
import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { VenuesService } from './venues.service';

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

const OWNER_ID = 'owner-1';
const VENUE_ID = 'venue-1';
const SAVED_LAT = -23.5614;
const SAVED_LNG = -46.6559;

function venueRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: VENUE_ID,
    ownerUserId: OWNER_ID,
    name: 'Bar Central',
    description: 'Bar',
    category: 'Bar',
    logoUrl: null,
    coverUrl: null,
    city: 'São Paulo',
    state: 'SP',
    lat: SAVED_LAT,
    lng: SAVED_LNG,
    contacts: {
      address: 'Rua Augusta, 1500',
      phone: '11999999999',
    },
    hoursJson: { mon: { open: '10:00', close: '22:00' } },
    photos: [],
    banners: [],
    ...overrides,
  };
}

function createPrisma() {
  return {
    venue: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    venuePhoto: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    review: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

function cleanupMock() {
  return {
    deleteStoredUpload: jest.fn().mockResolvedValue(undefined),
    deleteStoredUploads: jest.fn().mockResolvedValue(undefined),
  };
}

describe('VenuesService geolocation', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let mediaCleanup: ReturnType<typeof cleanupMock>;
  let service: VenuesService;

  beforeEach(() => {
    prisma = createPrisma();
    mediaCleanup = cleanupMock();
    service = new VenuesService(
      prisma as never,
      mediaCleanup as unknown as MediaCleanupService,
    );
    geocodeCityMock.mockReset();
    geocodeVenueProfileMock.mockReset();
    geocodeCityMock.mockResolvedValue({ lat: -23.5505, lng: -46.6333 });
    geocodeVenueProfileMock.mockResolvedValue({ lat: -10, lng: -20 });
    prisma.review.aggregate.mockResolvedValue({
      _avg: { rating: null },
      _count: { _all: 0 },
    });
    prisma.review.findMany.mockResolvedValue([]);
    prisma.venue.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...venueRecord(),
      ...data,
    }));
  });

  describe('getPublic', () => {
    it('does not geocode or update saved lat/lng', async () => {
      const venue = venueRecord();
      prisma.venue.findUnique.mockResolvedValue(venue);

      const result = await service.getPublic(VENUE_ID, '-23.55', '-46.63');

      expect(geocodeVenueProfileMock).not.toHaveBeenCalled();
      expect(prisma.venue.update).not.toHaveBeenCalled();
      expect(result.lat).toBe(SAVED_LAT);
      expect(result.lng).toBe(SAVED_LNG);
    });
  });

  describe('updateOwned', () => {
    beforeEach(() => {
      prisma.venue.findUnique.mockResolvedValue(venueRecord());
    });

    it('does not geocode when only hours change and preserves lat/lng', async () => {
      const hoursJson = { mon: { open: '18:00', close: '23:00' } };

      await service.updateOwned(OWNER_ID, VENUE_ID, { hoursJson });

      expect(geocodeVenueProfileMock).not.toHaveBeenCalled();
      expect(prisma.venue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VENUE_ID },
          data: expect.not.objectContaining({
            lat: expect.anything(),
            lng: expect.anything(),
          }),
        }),
      );
      const payload = prisma.venue.update.mock.calls[0][0].data;
      expect(payload.lat).toBeUndefined();
      expect(payload.lng).toBeUndefined();
      expect(payload.hoursJson).toEqual(hoursJson);
    });

    it('geocodes once when address changes and saves the new point', async () => {
      const point = { lat: -23.57, lng: -46.64 };
      geocodeVenueProfileMock.mockResolvedValue(point);

      await service.updateOwned(OWNER_ID, VENUE_ID, {
        contacts: { address: 'Rua Oscar Freire, 100' },
      });

      expect(geocodeVenueProfileMock).toHaveBeenCalledTimes(1);
      expect(geocodeVenueProfileMock).toHaveBeenCalledWith({
        address: 'Rua Oscar Freire, 100',
        city: 'São Paulo',
        state: 'SP',
      });
      const payload = prisma.venue.update.mock.calls[0][0].data;
      expect(payload.lat).toBe(point.lat);
      expect(payload.lng).toBe(point.lng);
    });

    it('preserves saved lat/lng when address changes but geocoding fails', async () => {
      geocodeVenueProfileMock.mockResolvedValue(null);

      await service.updateOwned(OWNER_ID, VENUE_ID, {
        contacts: { address: 'Endereço inexistente 99999' },
      });

      expect(geocodeVenueProfileMock).toHaveBeenCalledTimes(1);
      const payload = prisma.venue.update.mock.calls[0][0].data;
      expect(payload.lat).toBeUndefined();
      expect(payload.lng).toBeUndefined();
    });

    it('saves manual lat/lng without geocoding', async () => {
      const manualLat = -23.5489;
      const manualLng = -46.6388;

      await service.updateOwned(OWNER_ID, VENUE_ID, {
        contacts: { address: 'Rua Augusta, 2000' },
        lat: manualLat,
        lng: manualLng,
      });

      expect(geocodeVenueProfileMock).not.toHaveBeenCalled();
      const payload = prisma.venue.update.mock.calls[0][0].data;
      expect(payload.lat).toBe(manualLat);
      expect(payload.lng).toBe(manualLng);
    });

    it('does not overwrite a saved pair when only one coordinate is sent', async () => {
      await service.updateOwned(OWNER_ID, VENUE_ID, {
        lat: -23.5,
      });

      expect(geocodeVenueProfileMock).not.toHaveBeenCalled();
      const payload = prisma.venue.update.mock.calls[0][0].data;
      expect(payload.lat).toBeUndefined();
      expect(payload.lng).toBeUndefined();
    });
  });
});

describe('VenuesService media cleanup', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let mediaCleanup: ReturnType<typeof cleanupMock>;
  let service: VenuesService;

  beforeEach(() => {
    prisma = createPrisma();
    mediaCleanup = cleanupMock();
    service = new VenuesService(
      prisma as never,
      mediaCleanup as unknown as MediaCleanupService,
    );
    prisma.venue.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...venueRecord(),
      ...data,
    }));
  });

  it('removePhoto apaga o banco antes do cleanup', async () => {
    const order: string[] = [];
    const photoUrl = 'https://media.app-after.com.br/uploads/old.jpg';
    prisma.venue.findUnique.mockResolvedValue(venueRecord());
    prisma.venuePhoto.findFirst.mockResolvedValue({
      id: 'photo-1',
      venueId: VENUE_ID,
      url: photoUrl,
    });
    prisma.venuePhoto.delete.mockImplementation(async () => {
      order.push('db');
      return { id: 'photo-1' };
    });
    mediaCleanup.deleteStoredUpload.mockImplementation(async () => {
      order.push('cleanup');
    });

    await service.removePhoto(OWNER_ID, VENUE_ID, 'photo-1');

    expect(prisma.venuePhoto.delete).toHaveBeenCalledWith({
      where: { id: 'photo-1' },
    });
    expect(mediaCleanup.deleteStoredUpload).toHaveBeenCalledWith(photoUrl);
    expect(order).toEqual(['db', 'cleanup']);
  });

  it('troca logo apaga apenas a logo antiga', async () => {
    const oldLogo = 'https://media.app-after.com.br/uploads/logo-old.jpg';
    const oldCover = 'https://media.app-after.com.br/uploads/cover-old.jpg';
    prisma.venue.findUnique.mockResolvedValue(
      venueRecord({ logoUrl: oldLogo, coverUrl: oldCover }),
    );

    await service.updateOwned(OWNER_ID, VENUE_ID, {
      logoUrl: 'https://media.app-after.com.br/uploads/logo-new.jpg',
    });

    expect(mediaCleanup.deleteStoredUploads).toHaveBeenCalledWith([oldLogo]);
  });

  it('troca capa apaga apenas a capa antiga', async () => {
    const oldLogo = 'https://media.app-after.com.br/uploads/logo-old.jpg';
    const oldCover = 'https://media.app-after.com.br/uploads/cover-old.jpg';
    prisma.venue.findUnique.mockResolvedValue(
      venueRecord({ logoUrl: oldLogo, coverUrl: oldCover }),
    );

    await service.updateOwned(OWNER_ID, VENUE_ID, {
      coverUrl: 'https://media.app-after.com.br/uploads/cover-new.jpg',
    });

    expect(mediaCleanup.deleteStoredUploads).toHaveBeenCalledWith([oldCover]);
  });

  it('valor igual não apaga', async () => {
    const logo = 'https://media.app-after.com.br/uploads/logo.jpg';
    prisma.venue.findUnique.mockResolvedValue(venueRecord({ logoUrl: logo }));

    await service.updateOwned(OWNER_ID, VENUE_ID, { logoUrl: logo });

    expect(mediaCleanup.deleteStoredUploads).not.toHaveBeenCalled();
  });

  it('não apaga logo antiga se ela continuar na capa', async () => {
    const shared = 'https://media.app-after.com.br/uploads/shared.jpg';
    prisma.venue.findUnique.mockResolvedValue(
      venueRecord({ logoUrl: shared, coverUrl: shared }),
    );

    await service.updateOwned(OWNER_ID, VENUE_ID, {
      logoUrl: 'https://media.app-after.com.br/uploads/logo-new.jpg',
    });

    expect(mediaCleanup.deleteStoredUploads).not.toHaveBeenCalled();
  });

  it('falha de update não executa cleanup', async () => {
    prisma.venue.findUnique.mockResolvedValue(
      venueRecord({
        logoUrl: 'https://media.app-after.com.br/uploads/logo-old.jpg',
      }),
    );
    prisma.venue.update.mockRejectedValue(new Error('db down'));

    await expect(
      service.updateOwned(OWNER_ID, VENUE_ID, {
        logoUrl: 'https://media.app-after.com.br/uploads/logo-new.jpg',
      }),
    ).rejects.toThrow('db down');
    expect(mediaCleanup.deleteStoredUploads).not.toHaveBeenCalled();
  });
});
