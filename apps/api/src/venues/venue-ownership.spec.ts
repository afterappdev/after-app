import { ForbiddenException } from '@nestjs/common';
import {
  assertVenueOwned,
  findOwnedVenue,
  resolveOwnedVenueId,
} from './venue-ownership';

describe('venue ownership helpers', () => {
  const venue = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  const db = { venue };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('findOwnedVenue returns the row when owner matches', async () => {
    venue.findFirst.mockResolvedValue({ id: 'v1', ownerUserId: 'u1' });
    await expect(findOwnedVenue(db, 'u1', 'v1')).resolves.toEqual({
      id: 'v1',
      ownerUserId: 'u1',
    });
  });

  it('findOwnedVenue rejects foreign venues', async () => {
    venue.findFirst.mockResolvedValue(null);
    await expect(findOwnedVenue(db, 'u1', 'v2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('resolveOwnedVenueId honors explicit id after ownership check', async () => {
    venue.findFirst.mockResolvedValue({ id: 'v2', ownerUserId: 'u1' });
    await expect(resolveOwnedVenueId(db, 'u1', 'v2')).resolves.toBe('v2');
  });

  it('resolveOwnedVenueId falls back to sole owned venue', async () => {
    venue.findMany.mockResolvedValue([{ id: 'only' }]);
    await expect(resolveOwnedVenueId(db, 'u1')).resolves.toBe('only');
  });

  it('resolveOwnedVenueId uses legacy primary when multiple venues exist', async () => {
    venue.findMany.mockResolvedValue([{ id: 'oldest' }, { id: 'newer' }]);
    await expect(resolveOwnedVenueId(db, 'u1')).resolves.toBe('oldest');
  });

  it('assertVenueOwned delegates to findOwnedVenue', async () => {
    venue.findFirst.mockResolvedValue({ id: 'v1', ownerUserId: 'u1' });
    await expect(assertVenueOwned(db, 'u1', 'v1')).resolves.toBeUndefined();
  });
});
