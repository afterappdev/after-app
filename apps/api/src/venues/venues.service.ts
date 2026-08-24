import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PhotoKind, Prisma } from '@prisma/client';
import { computeIsOpen } from '../common/utils/hours';
import { geocodeCity, geocodeVenueProfile, contactsStreetAddress, haversineKm, parseCoord } from '../common/utils/geo';
import { PrismaService } from '../prisma/prisma.service';

function amenityFlags(contacts: unknown) {
  const c =
    contacts && typeof contacts === 'object' && !Array.isArray(contacts)
      ? (contacts as Record<string, unknown>)
      : {};
  return {
    acceptsMealVoucher: c.acceptsMealVoucher === true,
    hasKidsSpace: c.hasKidsSpace === true,
    hasCoverCharge: c.hasCoverCharge === true,
    coverCharge:
      c.coverCharge == null || c.coverCharge === ''
        ? ''
        : String(c.coverCharge),
    hasWheelchairAccess: c.hasWheelchairAccess === true,
  };
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  async listByCity(city: string) {
    return this.prisma.venue.findMany({
      where: { city: { equals: city, mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        logoUrl: true,
        coverUrl: true,
        city: true,
        state: true,
        lat: true,
        lng: true,
        hoursJson: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async searchByName(
    query: string,
    filters: {
      category?: string;
      minRating?: number;
      acceptsMealVoucher?: boolean;
      hasKidsSpace?: boolean;
      hasCoverCharge?: boolean;
      hasWheelchairAccess?: boolean;
    } = {},
  ) {
    const venues = await this.prisma.venue.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        logoUrl: true,
        coverUrl: true,
        city: true,
        state: true,
        hoursJson: true,
        contacts: true,
      },
      orderBy: { name: 'asc' },
    });

    const term = normalize(query);
    let ranked = term
      ? venues
          .map((venue) => {
            const name = normalize(venue.name);
            let score = 0;
            if (name === term) score = 3;
            else if (name.startsWith(term)) score = 2;
            else if (name.includes(term)) score = 1;
            return { venue, score };
          })
          .filter((item) => item.score > 0)
          .sort(
            (a, b) =>
              b.score - a.score ||
              a.venue.name.localeCompare(b.venue.name, 'pt-BR'),
          )
          .map((item) => item.venue)
      : venues;

    const category = filters.category?.trim();
    if (category) {
      ranked = ranked.filter((venue) => venue.category === category);
    }
    if (filters.acceptsMealVoucher) {
      ranked = ranked.filter(
        (venue) => amenityFlags(venue.contacts).acceptsMealVoucher,
      );
    }
    if (filters.hasKidsSpace) {
      ranked = ranked.filter(
        (venue) => amenityFlags(venue.contacts).hasKidsSpace,
      );
    }
    if (filters.hasCoverCharge) {
      ranked = ranked.filter(
        (venue) => amenityFlags(venue.contacts).hasCoverCharge,
      );
    }
    if (filters.hasWheelchairAccess) {
      ranked = ranked.filter(
        (venue) => amenityFlags(venue.contacts).hasWheelchairAccess,
      );
    }

    const stats = await this.reviewStatsBatch(ranked.map((venue) => venue.id));
    const minRating = filters.minRating ?? 0;
    if (minRating > 0) {
      ranked = ranked.filter(
        (venue) => (stats.get(venue.id)?.avgRating ?? 0) >= minRating,
      );
    }

    return ranked.slice(0, 40).map((venue) => {
      const { contacts, hoursJson, ...rest } = venue;
      const review = stats.get(venue.id);
      return {
        ...rest,
        ...amenityFlags(contacts),
        isOpen: computeIsOpen(hoursJson),
        avgRating: review?.avgRating ?? null,
        reviewCount: review?.reviewCount ?? 0,
      };
    });
  }

  async getPublic(id: string, lat?: string, lng?: string, city?: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        banners: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { schedules: true },
        },
      },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    const point = await geocodeVenueProfile({
      address: contactsStreetAddress(venue.contacts),
      city: venue.city,
      state: venue.state,
    });
    const located =
      point &&
      (venue.lat == null ||
        venue.lng == null ||
        Math.abs(venue.lat - point.lat) >= 1e-5 ||
        Math.abs(venue.lng - point.lng) >= 1e-5)
        ? await this.prisma.venue.update({
            where: { id: venue.id },
            data: { lat: point.lat, lng: point.lng },
          })
        : venue;

    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const origin =
      userLat != null && userLng != null
        ? { lat: userLat, lng: userLng }
        : await geocodeCity((city ?? located.city).trim());

    const reviewStats = await this.reviewStats(id);

    return {
      ...located,
      photos: venue.photos,
      banners: venue.banners,
      isOpen: computeIsOpen(located.hoursJson),
      distanceKm: origin ? haversineKm(origin, located) : null,
      ...reviewStats,
    };
  }

  async listReviews(venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    return this.reviewStats(venueId);
  }

  async upsertReview(
    user: { userId: string; role: 'USER' | 'VENUE' },
    venueId: string,
    data: { rating: number; testimonial?: string },
  ) {
    if (user.role !== 'USER') {
      throw new ForbiddenException(
        'Contas de estabelecimento não podem avaliar',
      );
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerUserId: true },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId === user.userId) {
      throw new ForbiddenException(
        'Você não pode avaliar o próprio estabelecimento',
      );
    }

    const testimonial = data.testimonial?.trim() || null;
    await this.prisma.review.upsert({
      where: { userId_venueId: { userId: user.userId, venueId } },
      create: {
        userId: user.userId,
        venueId,
        rating: data.rating,
        testimonial,
      },
      update: {
        rating: data.rating,
        testimonial,
      },
    });

    return this.reviewStats(venueId);
  }

  private async reviewStats(venueId: string) {
    const [agg, reviews] = await Promise.all([
      this.prisma.review.aggregate({
        where: { venueId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.review.findMany({
        where: { venueId },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
    ]);
    const count = agg._count._all;
    const avg = agg._avg.rating;
    return {
      avgRating: avg == null ? null : Math.round(avg * 10) / 10,
      reviewCount: count,
      reviews: reviews.map((review) => ({
        id: review.id,
        userId: review.userId,
        rating: review.rating,
        testimonial: review.testimonial,
        createdAt: review.createdAt,
        user: review.user,
      })),
    };
  }

  private async reviewStatsBatch(venueIds: string[]) {
    const map = new Map<
      string,
      { avgRating: number | null; reviewCount: number }
    >();
    if (venueIds.length === 0) return map;
    const grouped = await this.prisma.review.groupBy({
      by: ['venueId'],
      where: { venueId: { in: venueIds } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const row of grouped) {
      const avg = row._avg.rating;
      map.set(row.venueId, {
        avgRating: avg == null ? null : Math.round(avg * 10) / 10,
        reviewCount: row._count._all,
      });
    }
    return map;
  }

  async updateOwned(
    userId: string,
    venueId: string,
    data: {
      name?: string;
      description?: string;
      category?: string;
      logoUrl?: string;
      coverUrl?: string;
      city?: string;
      state?: string;
      lat?: number;
      lng?: number;
      contacts?: Prisma.InputJsonValue | object;
      hoursJson?: Prisma.InputJsonValue | object;
    },
  ) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId !== userId) {
      throw new ForbiddenException('Sem permissão para editar este local');
    }

    const nextCity = data.city ?? venue.city;
    const nextState = data.state ?? venue.state;
    const nextContacts = data.contacts ?? venue.contacts;
    const point = await geocodeVenueProfile({
      address: contactsStreetAddress(nextContacts),
      city: nextCity,
      state: nextState,
    });
    if (point) {
      data.lat = point.lat;
      data.lng = point.lng;
    }

    return this.prisma.venue.update({
      where: { id: venueId },
      data: {
        ...data,
        contacts:
          data.contacts === undefined
            ? undefined
            : (data.contacts as Prisma.InputJsonValue),
        hoursJson:
          data.hoursJson === undefined
            ? undefined
            : (data.hoursJson as Prisma.InputJsonValue),
      },
    });
  }

  async addPhoto(
    userId: string,
    venueId: string,
    url: string,
    kind: PhotoKind = PhotoKind.GALLERY,
  ) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId !== userId) {
      throw new ForbiddenException('Sem permissão');
    }

    return this.prisma.venuePhoto.create({
      data: { venueId, url, kind },
    });
  }

  async removePhoto(userId: string, venueId: string, photoId: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId !== userId) {
      throw new ForbiddenException('Sem permissão');
    }
    const photo = await this.prisma.venuePhoto.findFirst({
      where: { id: photoId, venueId },
    });
    if (!photo) {
      throw new NotFoundException('Foto não encontrada');
    }
    await this.prisma.venuePhoto.delete({ where: { id: photoId } });
    return { ok: true };
  }
}
