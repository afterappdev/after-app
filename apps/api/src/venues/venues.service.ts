import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaType, PhotoKind, Prisma, Role } from '@prisma/client';
import { computeIsOpen } from '../common/utils/hours';
import {
  contactsStreetAddress,
  geocodeCity,
  geocodeVenueProfile,
  haversineKm,
  isValidLatLng,
  parseCoord,
} from '../common/utils/geo';
import { inferMediaType } from '../common/utils/media-type';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertUserAccountActive } from '../common/account/account-eligibility';
import {
  blockedVenueIdsForUser,
  isVenuePubliclyVisible,
  publicVenueWhere,
} from '../common/moderation/audience';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaCleanupService } from '../uploads/media-cleanup.service';
import {
  linkHistoricalWelcomeClaim,
  readWelcomeCreditSecret,
  welcomeCreditsForDocumentLink,
} from '../credits/welcome-credit';
import {
  VENUE_DOCUMENT_TAKEN,
  isVenueDocumentConflict,
  omitVenueDocument,
  resolveVenueDocument,
} from './venue-document';
import {
  categoryMatches,
  isLegacyLiveMusicCategory,
  LEGACY_LIVE_MUSIC_CATEGORY,
  shouldPreserveCategory,
  storedCategory,
} from './venue-categories';
import { assertVenueDocumentAvailableForOwner } from './venue-document-policy';
import { CreateVenueDto } from './dto/create-venue.dto';

export const AMENITY_BOOL_KEYS = [
  'acceptsMealVoucher',
  'hasKidsSpace',
  'hasCoverCharge',
  'hasWheelchairAccess',
  'isPetFriendly',
  'hasLiveMusic',
  'hasBirthdayTreat',
  'hasDelivery',
  'hasGlutenFreeFood',
  'hasLactoseFreeFood',
  'hasAirConditioning',
  'hasBabyChangingRoom',
  'hasOwnParking',
  'hasWifi',
  'acceptsReservations',
  'hasOutdoorArea',
  'showsSportsBroadcasts',
  'hasVegetarianOptions',
  'hasVeganOptions',
] as const;

type AmenityBoolKey = (typeof AMENITY_BOOL_KEYS)[number];

function amenityFlags(contacts: unknown) {
  const c =
    contacts && typeof contacts === 'object' && !Array.isArray(contacts)
      ? (contacts as Record<string, unknown>)
      : {};
  const flags = Object.fromEntries(
    AMENITY_BOOL_KEYS.map((key) => [key, c[key] === true]),
  ) as Record<AmenityBoolKey, boolean>;
  return {
    ...flags,
    coverCharge:
      c.coverCharge == null || c.coverCharge === ''
        ? ''
        : String(c.coverCharge),
  };
}

function mergeVenueContacts(
  stored: unknown,
  incoming: unknown,
): Prisma.InputJsonValue {
  const base =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? { ...(stored as Record<string, unknown>) }
      : {};
  const next =
    incoming && typeof incoming === 'object' && !Array.isArray(incoming)
      ? (incoming as Record<string, unknown>)
      : {};
  return { ...base, ...next } as Prisma.InputJsonValue;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaCleanup: MediaCleanupService,
    @Optional() private readonly locations?: LocationsService,
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService,
  ) {}

  async listByCity(city: string, user?: AuthUser | null) {
    const blockedIds = await blockedVenueIdsForUser(this.prisma, user);
    return this.prisma.venue.findMany({
      where: {
        city: { equals: city, mode: 'insensitive' },
        ...publicVenueWhere(blockedIds),
      },
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

  async geocodeLookup(input: {
    address?: string;
    city?: string;
    state?: string;
  }) {
    const address = input.address?.trim() ?? '';
    if (!address) {
      throw new BadRequestException(
        'Informe o endereço para encontrar no mapa.',
      );
    }
    const point = await geocodeVenueProfile({
      address,
      city: input.city,
      state: input.state,
    });
    if (!point || !isValidLatLng(point)) {
      throw new NotFoundException('Não encontramos esse endereço no mapa.');
    }
    return { lat: point.lat, lng: point.lng };
  }

  async searchByName(
    query: string,
    filters: {
      category?: string;
      minRating?: number;
    } & Partial<Record<AmenityBoolKey, boolean>> = {},
    user?: AuthUser | null,
  ) {
    const blockedIds = await blockedVenueIdsForUser(this.prisma, user);
    const venues = await this.prisma.venue.findMany({
      where: publicVenueWhere(blockedIds),
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
      ranked = ranked.filter((venue) => categoryMatches(venue.category, category));
    }
    for (const key of AMENITY_BOOL_KEYS) {
      if (filters[key]) {
        ranked = ranked.filter((venue) => amenityFlags(venue.contacts)[key]);
      }
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

  async getPublic(
    id: string,
    lat?: string,
    lng?: string,
    city?: string,
    user?: AuthUser | null,
  ) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: {
        owner: { select: { accountStatus: true } },
        photos: { orderBy: { sortOrder: 'asc' } },
        banners: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { schedules: true },
        },
      },
    });
    if (!venue || !isVenuePubliclyVisible(venue)) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    const blockedIds = await blockedVenueIdsForUser(this.prisma, user);
    if (blockedIds.includes(id)) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const origin =
      userLat != null && userLng != null
        ? { lat: userLat, lng: userLng }
        : await geocodeCity((city ?? venue.city).trim());

    const reviewStats = await this.reviewStats(id);
    const visible = omitVenueDocument(venue);

    return {
      ...visible,
      photos: venue.photos,
      banners: venue.banners,
      isOpen: computeIsOpen(venue.hoursJson),
      isOwner: Boolean(
        user && user.role === 'VENUE' && user.userId === venue.ownerUserId,
      ),
      distanceKm: origin ? haversineKm(origin, venue) : null,
      ...reviewStats,
    };
  }

  async listReviews(venueId: string, user?: AuthUser | null) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        moderationHiddenAt: true,
        owner: { select: { accountStatus: true } },
      },
    });
    if (!venue || !isVenuePubliclyVisible(venue)) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    const blockedIds = await blockedVenueIdsForUser(this.prisma, user);
    if (blockedIds.includes(venueId)) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    return this.reviewStats(venueId);
  }

  async upsertReview(
    user: { userId: string; role: 'USER' | 'VENUE' | 'ADMIN' },
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
      select: {
        id: true,
        ownerUserId: true,
        moderationHiddenAt: true,
        owner: { select: { accountStatus: true } },
      },
    });
    if (!venue || !isVenuePubliclyVisible(venue)) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId === user.userId) {
      throw new ForbiddenException(
        'Você não pode avaliar o próprio estabelecimento',
      );
    }
    if (user.role === 'USER') {
      const blocked = await this.prisma.userVenueBlock.findUnique({
        where: {
          userId_venueId: { userId: user.userId, venueId },
        },
      });
      if (blocked) {
        throw new ForbiddenException(
          'Desbloqueie o estabelecimento para avaliá-lo',
        );
      }
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

  async replyToReview(
    user: { userId: string; role: 'USER' | 'VENUE' | 'ADMIN' },
    venueId: string,
    reviewId: string,
    reply: string,
  ) {
    if (user.role !== 'VENUE') {
      throw new ForbiddenException(
        'Apenas o estabelecimento pode responder avaliações',
      );
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerUserId: true },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId !== user.userId) {
      throw new ForbiddenException(
        'Sem permissão para responder estas avaliações',
      );
    }

    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, venueId },
      select: { id: true },
    });
    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    const text = reply.trim() || null;
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        venueReply: text,
        venueReplyAt: text ? new Date() : null,
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
        venueReply: review.venueReply,
        venueReplyAt: review.venueReplyAt,
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
    await assertUserAccountActive(this.prisma, userId);
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId !== userId) {
      throw new ForbiddenException('Sem permissão para editar este local');
    }

    const previousLogo = venue.logoUrl;
    const previousCover = venue.coverUrl;
    const { lat: requestedLat, lng: requestedLng, ...rest } = data;
    if (typeof rest.category === 'string') {
      const trimmed = rest.category.trim();
      if (!trimmed) {
        if (isLegacyLiveMusicCategory(venue.category)) {
          throw new BadRequestException(
            'Selecione uma categoria do catálogo atual.',
          );
        }
        if (shouldPreserveCategory(venue.category)) {
          delete rest.category;
        }
      } else if (isLegacyLiveMusicCategory(trimmed)) {
        rest.category = LEGACY_LIVE_MUSIC_CATEGORY;
      } else {
        rest.category = storedCategory(trimmed);
      }
    }
    if (rest.contacts !== undefined) {
      rest.contacts = mergeVenueContacts(venue.contacts, rest.contacts);
    }
    const nextCity = data.city ?? venue.city;
    const nextState = data.state ?? venue.state;
    const nextContacts = data.contacts ?? venue.contacts;
    const updateData: typeof rest & {
      lat?: number;
      lng?: number;
      ibgeCityId?: number | null;
    } = { ...rest };
    const cityChanged =
      data.city !== undefined && data.city.trim() !== venue.city.trim();
    const stateChanged =
      data.state !== undefined && data.state.trim() !== venue.state.trim();
    if (cityChanged || stateChanged) {
      updateData.ibgeCityId = this.locations
        ? await this.locations.resolveMunicipalityId(nextCity, nextState)
        : null;
    }

    if (isValidLatLng({ lat: requestedLat, lng: requestedLng })) {
      updateData.lat = requestedLat;
      updateData.lng = requestedLng;
    } else {
      const locationChanged =
        contactsStreetAddress(nextContacts) !==
          contactsStreetAddress(venue.contacts) ||
        (data.city !== undefined && data.city.trim() !== venue.city.trim()) ||
        (data.state !== undefined && data.state.trim() !== venue.state.trim());

      if (locationChanged) {
        const point = await geocodeVenueProfile({
          address: contactsStreetAddress(nextContacts),
          city: nextCity,
          state: nextState,
        });
        if (point) {
          updateData.lat = point.lat;
          updateData.lng = point.lng;
        }
      }
    }

    const updated = await this.prisma.venue.update({
      where: { id: venueId },
      data: {
        ...updateData,
        contacts:
          updateData.contacts === undefined
            ? undefined
            : (updateData.contacts as Prisma.InputJsonValue),
        hoursJson:
          updateData.hoursJson === undefined
            ? undefined
            : (updateData.hoursJson as Prisma.InputJsonValue),
      },
    });

    const nextLogo =
      data.logoUrl === undefined ? previousLogo : data.logoUrl || null;
    const nextCover =
      data.coverUrl === undefined ? previousCover : data.coverUrl || null;
    const stale: string[] = [];
    if (
      data.logoUrl !== undefined &&
      previousLogo &&
      previousLogo !== nextLogo &&
      previousLogo !== nextCover
    ) {
      stale.push(previousLogo);
    }
    if (
      data.coverUrl !== undefined &&
      previousCover &&
      previousCover !== nextCover &&
      previousCover !== nextLogo
    ) {
      stale.push(previousCover);
    }
    if (stale.length > 0) {
      await this.mediaCleanup.deleteStoredUploads(stale);
    }

    return omitVenueDocument(updated);
  }

  /**
   * Owner-only fiscal identity. A missing document is an older account.
   * The document alone is not enough to issue an invoice.
   */
  async createOwnedVenue(userId: string, dto: CreateVenueDto) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!owner || owner.role !== Role.VENUE) {
      throw new ForbiddenException('Conta não é de estabelecimento');
    }

    let document: ReturnType<typeof resolveVenueDocument> | null = null;
    if (dto.documentType && dto.documentNumber) {
      document = resolveVenueDocument({
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
      });
    } else if (dto.documentType || dto.documentNumber) {
      throw new BadRequestException('Informe CPF/CNPJ completo.');
    }

    try {
      const venue = await this.prisma.$transaction(async (tx) => {
        if (document) {
          await assertVenueDocumentAvailableForOwner(tx, userId, document);
        }
        return tx.venue.create({
          data: {
            ownerUserId: userId,
            name: dto.name.trim(),
            city: dto.city.trim(),
            state: dto.state.trim().toUpperCase(),
            category: dto.category?.trim() || undefined,
            ...(document
              ? {
                  documentType: document.documentType,
                  documentDigits: document.documentDigits,
                }
              : {}),
            wallet: { create: { balance: 0 } },
          },
        });
      });
      return omitVenueDocument(venue);
    } catch (error) {
      if (isVenueDocumentConflict(error)) {
        throw new ConflictException(VENUE_DOCUMENT_TAKEN);
      }
      throw error;
    }
  }

  async readFiscalDocument(userId: string, venueId: string) {
    const venue = await this.requireOwnedVenue(userId, venueId);
    return {
      documentType: venue.documentType,
      documentDigits: venue.documentDigits,
      sufficientForInvoice: false,
      additionalFields: ['fiscalName', 'fiscalEmail', 'address'],
    };
  }

  async saveFiscalDocument(
    userId: string,
    venueId: string,
    input: { documentType?: string | null; documentNumber?: string | null },
  ) {
    await this.requireOwnedVenue(userId, venueId);
    const document = resolveVenueDocument(input);
    try {
      await this.prisma.$transaction(async (tx) => {
        await assertVenueDocumentAvailableForOwner(
          tx,
          userId,
          document,
          venueId,
        );
        const credits = await welcomeCreditsForDocumentLink(tx, venueId);
        if (credits > 0) {
          const secret = readWelcomeCreditSecret(
            this.config,
            'Não foi possível salvar o documento agora.',
          );
          await linkHistoricalWelcomeClaim(tx, document, secret, venueId, credits);
        }
        await tx.venue.update({
          where: { id: venueId },
          data: {
            documentType: document.documentType,
            documentDigits: document.documentDigits,
          },
        });
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (isVenueDocumentConflict(error)) {
        throw new ConflictException(VENUE_DOCUMENT_TAKEN);
      }
      throw error;
    }
    return this.readFiscalDocument(userId, venueId);
  }

  private async requireOwnedVenue(userId: string, venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        ownerUserId: true,
        documentType: true,
        documentDigits: true,
      },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId !== userId) {
      throw new ForbiddenException('Sem permissão para editar este local');
    }
    return venue;
  }

  async addPhoto(
    userId: string,
    venueId: string,
    url: string,
    kind: PhotoKind = PhotoKind.GALLERY,
    mediaType?: MediaType,
  ) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId !== userId) {
      throw new ForbiddenException('Sem permissão');
    }

    return this.prisma.venuePhoto.create({
      data: {
        venueId,
        url,
        kind,
        mediaType: inferMediaType(url, mediaType),
      },
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
    if (
      photo.url &&
      photo.url !== venue.logoUrl &&
      photo.url !== venue.coverUrl
    ) {
      await this.mediaCleanup.deleteStoredUpload(photo.url);
    }
    return { ok: true };
  }
}
