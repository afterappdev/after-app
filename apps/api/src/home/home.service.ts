import { Injectable } from '@nestjs/common';
import { BUSINESS_TIME_ZONE } from '../common/constants/timezone';
import { PrismaService } from '../prisma/prisma.service';
import { geocodeCity, haversineKm, parseCoord } from '../common/utils/geo';
import { computeIsOpen } from '../common/utils/hours';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  blockedVenueIdsForUser,
  publicVenueWhere,
} from '../common/moderation/audience';

function sortOpenThenDistance<T extends { isOpen?: boolean | null; distanceKm?: number | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const openA = a.isOpen ? 0 : 1;
    const openB = b.isOpen ? 0 : 1;
    if (openA !== openB) return openA - openB;
    const da = a.distanceKm ?? null;
    const db = b.distanceKm ?? null;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}

/** Civil calendar day in America/Sao_Paulo, stored as UTC midnight. Independent of the process timezone. */
export function businessCalendarDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async promotions(
    city: string,
    date?: string,
    lat?: string,
    lng?: string,
    user?: AuthUser | null,
    now: Date = new Date(),
  ) {
    const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim()) : null;
    const day = match
      ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      : businessCalendarDate(now);

    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const origin =
      userLat != null && userLng != null
        ? { lat: userLat, lng: userLng }
        : await geocodeCity(city);

    const blockedIds = await blockedVenueIdsForUser(this.prisma, user);
    const venueWhere = publicVenueWhere(blockedIds);

    const schedules = await this.prisma.bannerSchedule.findMany({
      where: {
        citySnapshot: { equals: city, mode: 'insensitive' },
        displayDate: day,
        banner: {
          status: 'ACTIVE',
          venue: venueWhere,
        },
      },
      include: {
        banner: {
          include: {
            venue: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                coverUrl: true,
                description: true,
                category: true,
                city: true,
                state: true,
                lat: true,
                lng: true,
                hoursJson: true,
              },
            },
          },
        },
      },
      orderBy: { displayDate: 'desc' },
    });

    return sortOpenThenDistance(
      schedules.map((s) => ({
        bannerId: s.banner.id,
        imageUrl: s.banner.imageUrl,
        title: s.banner.title,
        description: s.banner.description,
        displayDate: s.displayDate,
        venue: s.banner.venue,
        isOpen: computeIsOpen(s.banner.venue.hoursJson),
        distanceKm: origin ? haversineKm(origin, s.banner.venue) : null,
      })),
    );
  }

  async venues(
    city: string,
    lat?: string,
    lng?: string,
    user?: AuthUser | null,
  ) {
    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const origin =
      userLat != null && userLng != null
        ? { lat: userLat, lng: userLng }
        : await geocodeCity(city);

    const blockedIds = await blockedVenueIdsForUser(this.prisma, user);

    const venues = await this.prisma.venue.findMany({
      where: {
        city: { equals: city, mode: 'insensitive' },
        ...publicVenueWhere(blockedIds),
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        coverUrl: true,
        description: true,
        category: true,
        city: true,
        state: true,
        lat: true,
        lng: true,
        hoursJson: true,
      },
      orderBy: { name: 'asc' },
    });

    return sortOpenThenDistance(
      venues.map((v) => ({
        ...v,
        isOpen: computeIsOpen(v.hoursJson),
        distanceKm: origin ? haversineKm(origin, v) : null,
      })),
    );
  }
}
