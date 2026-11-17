import { Injectable } from '@nestjs/common';
import { BUSINESS_TIME_ZONE } from '../common/constants/timezone';
import { PrismaService } from '../prisma/prisma.service';
import { geocodeCity, haversineKm, parseCoord } from '../common/utils/geo';
import { computeIsOpen } from '../common/utils/hours';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { blockedVenueIdsForUser } from '../common/moderation/audience';
import {
  filterVenuesForStrangerDiscovery,
  strangerDiscoveryVenueWhere,
} from '../venues/venue-publication';
import { VenuesService } from '../venues/venues.service';

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

function withReviewStats<T extends { id: string }>(
  venue: T,
  stats: Map<string, { avgRating: number | null; reviewCount: number }>,
) {
  const review = stats.get(venue.id);
  return {
    ...venue,
    avgRating: review?.avgRating ?? null,
    reviewCount: review?.reviewCount ?? 0,
  };
}

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venuesService: VenuesService,
  ) {}

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
    const venueWhere = strangerDiscoveryVenueWhere(blockedIds);

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

    const stats = await this.venuesService.reviewStatsForVenueIds(
      schedules.map((s) => s.banner.venue.id),
    );

    return sortOpenThenDistance(
      schedules.map((s) => ({
        bannerId: s.banner.id,
        scheduleId: s.id ?? null,
        tier: s.tier === 'VIP' ? 'VIP' : 'COMMON',
        featured: s.tier === 'VIP',
        imageUrl: s.banner.imageUrl,
        title: s.banner.title,
        description: s.banner.description,
        displayDate: s.displayDate,
        venue: withReviewStats(s.banner.venue, stats),
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

    const venues = filterVenuesForStrangerDiscovery(
      await this.prisma.venue.findMany({
        where: {
          city: { equals: city, mode: 'insensitive' },
          ...strangerDiscoveryVenueWhere(blockedIds),
        },
        select: {
          id: true,
          ownerUserId: true,
          moderationHiddenAt: true,
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
          contacts: true,
        },
        orderBy: { name: 'asc' },
      }),
    );

    const stats = await this.venuesService.reviewStatsForVenueIds(
      venues.map((v) => v.id),
    );

    return sortOpenThenDistance(
      venues.map((v) => ({
        ...withReviewStats(v, stats),
        isOpen: computeIsOpen(v.hoursJson),
        distanceKm: origin ? haversineKm(origin, v) : null,
      })),
    );
  }
}
