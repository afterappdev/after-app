import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { geocodeCity, geocodeVenueProfile, contactsStreetAddress, haversineKm, parseCoord } from '../common/utils/geo';
import { computeIsOpen } from '../common/utils/hours';

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

function omitContacts<T extends { contacts?: unknown }>(venue: T) {
  const { contacts: _contacts, ...rest } = venue;
  return rest;
}

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  private async withVenueCoords<
    T extends {
      id: string;
      name: string;
      city: string;
      state?: string | null;
      lat?: number | null;
      lng?: number | null;
      contacts?: unknown;
    },
  >(venue: T): Promise<T> {
    const point = await geocodeVenueProfile({
      address: contactsStreetAddress(venue.contacts),
      city: venue.city,
      state: venue.state,
    });
    if (!point) return venue;
    const same =
      venue.lat != null &&
      venue.lng != null &&
      Math.abs(venue.lat - point.lat) < 1e-5 &&
      Math.abs(venue.lng - point.lng) < 1e-5;
    if (same) return venue;
    await this.prisma.venue.update({
      where: { id: venue.id },
      data: { lat: point.lat, lng: point.lng },
    });
    return { ...venue, lat: point.lat, lng: point.lng };
  }

  async promotions(city: string, date?: string, lat?: string, lng?: string) {
    const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim()) : null;
    const displayDate = match
      ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      : new Date();
    const day = match
      ? displayDate
      : new Date(
          Date.UTC(
            displayDate.getFullYear(),
            displayDate.getMonth(),
            displayDate.getDate(),
          ),
        );

    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const origin =
      userLat != null && userLng != null
        ? { lat: userLat, lng: userLng }
        : await geocodeCity(city);

    const schedules = await this.prisma.bannerSchedule.findMany({
      where: {
        citySnapshot: { equals: city, mode: 'insensitive' },
        displayDate: day,
        banner: { status: 'ACTIVE' },
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
                contacts: true,
                hoursJson: true,
              },
            },
          },
        },
      },
      orderBy: { displayDate: 'desc' },
    });

    const located = await Promise.all(
      schedules.map(async (s) => ({
        ...s,
        banner: {
          ...s.banner,
          venue: await this.withVenueCoords(s.banner.venue),
        },
      })),
    );

    return sortOpenThenDistance(
      located.map((s) => ({
        bannerId: s.banner.id,
        imageUrl: s.banner.imageUrl,
        title: s.banner.title,
        description: s.banner.description,
        displayDate: s.displayDate,
        venue: omitContacts(s.banner.venue),
        isOpen: computeIsOpen(s.banner.venue.hoursJson),
        distanceKm: origin ? haversineKm(origin, s.banner.venue) : null,
      })),
    );
  }

  async venues(city: string, lat?: string, lng?: string) {
    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const origin =
      userLat != null && userLng != null
        ? { lat: userLat, lng: userLng }
        : await geocodeCity(city);

    const venues = await this.prisma.venue.findMany({
      where: { city: { equals: city, mode: 'insensitive' } },
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
        contacts: true,
        hoursJson: true,
      },
      orderBy: { name: 'asc' },
    });

    const located = await Promise.all(
      venues.map((v) => this.withVenueCoords(v)),
    );

    return sortOpenThenDistance(
      located.map((v) => {
        const { contacts: _contacts, ...rest } = v;
        return {
          ...rest,
          isOpen: computeIsOpen(v.hoursJson),
          distanceKm: origin ? haversineKm(origin, v) : null,
        };
      }),
    );
  }
}
