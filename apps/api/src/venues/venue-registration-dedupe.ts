import {
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  Prisma,
  StandardProfileStatus,
  VenueProfileKind,
} from '@prisma/client';
import { contactsStreetAddress } from '../common/utils/geo';
import {
  AFTER_STANDARD_OWNER_USER_ID,
  isPublishedStandardVenue,
} from './venue-standard-profile';

type PrismaVenueClient = {
  venue: {
    findMany: (
      args: Prisma.VenueFindManyArgs,
    ) => Promise<VenueRegistrationCandidate[]>;
  };
};

export type VenueRegistrationLocationInput = {
  name: string;
  city: string;
  state: string;
  address?: string | null;
};

type VenueRegistrationCandidate = {
  id: string;
  name: string;
  city: string;
  state: string;
  profileKind: VenueProfileKind;
  standardProfileStatus: StandardProfileStatus | null;
  contacts: unknown;
  ownerUserId: string;
};

export type VenueRegistrationConflictKind =
  | 'claim_standard'
  | 'already_managed'
  | 'review';

export type VenueRegistrationConflict = {
  kind: VenueRegistrationConflictKind;
  venueId: string;
  venueName: string;
  address?: string;
};

/** Normaliza nome/endereço para comparação (acentos, pontuação, espaços). */
export function normalizeVenueComparableText(value: string): string {
  const expanded = value
    .replace(/\bav\.?\b/gi, 'avenida')
    .replace(/\br\.?\b/gi, 'rua')
    .replace(/\best\.?\b/gi, 'estrada')
    .replace(/\brod\.?\b/gi, 'rodovia');
  return expanded
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addressesClearlyDifferent(
  proposed: string | null | undefined,
  existing: string,
): boolean {
  const a = normalizeVenueComparableText(proposed?.trim() ?? '');
  const b = normalizeVenueComparableText(existing);
  if (!a || !b) return false;
  if (a === b) return false;
  if (a.includes(b) || b.includes(a)) return false;
  return true;
}

function venueStreetAddress(venue: VenueRegistrationCandidate): string {
  return contactsStreetAddress(venue.contacts);
}

function isManagedCompleteVenue(venue: VenueRegistrationCandidate): boolean {
  return (
    venue.profileKind === VenueProfileKind.COMPLETE &&
    venue.ownerUserId !== AFTER_STANDARD_OWNER_USER_ID
  );
}

function pickStrongestConflict(
  matches: VenueRegistrationConflict[],
): VenueRegistrationConflict | null {
  if (matches.length === 0) return null;
  const rank = (kind: VenueRegistrationConflictKind) => {
    switch (kind) {
      case 'claim_standard':
        return 3;
      case 'already_managed':
        return 2;
      default:
        return 1;
    }
  };
  return [...matches].sort((a, b) => rank(b.kind) - rank(a.kind))[0] ?? null;
}

function classifyMatch(
  venue: VenueRegistrationCandidate,
): VenueRegistrationConflict | null {
  if (isPublishedStandardVenue(venue)) {
    return {
      kind: 'claim_standard',
      venueId: venue.id,
      venueName: venue.name,
      address: venueStreetAddress(venue) || undefined,
    };
  }
  if (isManagedCompleteVenue(venue)) {
    return {
      kind: 'already_managed',
      venueId: venue.id,
      venueName: venue.name,
      address: venueStreetAddress(venue) || undefined,
    };
  }
  if (venue.profileKind === VenueProfileKind.STANDARD) {
    return {
      kind: 'review',
      venueId: venue.id,
      venueName: venue.name,
      address: venueStreetAddress(venue) || undefined,
    };
  }
  return {
    kind: 'review',
    venueId: venue.id,
    venueName: venue.name,
    address: venueStreetAddress(venue) || undefined,
  };
}

export async function findVenueRegistrationConflicts(
  prisma: PrismaVenueClient,
  input: VenueRegistrationLocationInput,
): Promise<VenueRegistrationConflict[]> {
  const normName = normalizeVenueComparableText(input.name);
  if (normName.length < 2) return [];

  const state = input.state.trim().toUpperCase();
  const city = input.city.trim();
  if (!state || !city) return [];

  const candidates = await prisma.venue.findMany({
    where: {
      state,
      ownerArchivedAt: null,
      city: { equals: city, mode: 'insensitive' },
    },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      profileKind: true,
      standardProfileStatus: true,
      contacts: true,
      ownerUserId: true,
    },
    take: 100,
  });

  const conflicts: VenueRegistrationConflict[] = [];
  for (const venue of candidates) {
    if (normalizeVenueComparableText(venue.name) !== normName) continue;
    const existingAddress = venueStreetAddress(venue);
    if (
      addressesClearlyDifferent(input.address, existingAddress) &&
      existingAddress.trim().length > 0
    ) {
      continue;
    }
    const conflict = classifyMatch(venue);
    if (conflict) conflicts.push(conflict);
  }
  return conflicts;
}

export function venueRegistrationConflictMessage(
  conflict: VenueRegistrationConflict,
): string {
  switch (conflict.kind) {
    case 'claim_standard':
      return `Encontramos ${conflict.venueName} no After. Se você é responsável por este local, solicite acesso ao perfil existente.`;
    case 'already_managed':
      return `${conflict.venueName} já tem um perfil gerenciado no After. Fale com contato@app-after.com.br se precisar rever a titularidade.`;
    default:
      return `Identificamos um local semelhante a ${conflict.venueName}. O caso será analisado pela equipe After — contato@app-after.com.br.`;
  }
}

export function venueRegistrationConflictPayload(
  conflict: VenueRegistrationConflict,
) {
  return {
    code:
      conflict.kind === 'claim_standard'
        ? 'VENUE_REGISTRATION_CLAIM_EXISTING'
        : conflict.kind === 'already_managed'
          ? 'VENUE_REGISTRATION_ALREADY_MANAGED'
          : 'VENUE_REGISTRATION_NEEDS_REVIEW',
    message: venueRegistrationConflictMessage(conflict),
    venueId: conflict.venueId,
    venueName: conflict.venueName,
    claimPath:
      conflict.kind === 'claim_standard'
        ? `/app/#/reivindicar?venueId=${encodeURIComponent(conflict.venueId)}`
        : undefined,
  };
}

export async function assertVenueRegistrationAllowed(
  prisma: PrismaVenueClient,
  input: VenueRegistrationLocationInput,
): Promise<void> {
  const conflicts = await findVenueRegistrationConflicts(prisma, input);
  const conflict = pickStrongestConflict(conflicts);
  if (!conflict) return;
  const payload = venueRegistrationConflictPayload(conflict);
  throw new HttpException(payload, HttpStatus.CONFLICT);
}

export async function assertAdminStandardVenueCreateAllowed(
  prisma: PrismaVenueClient,
  input: VenueRegistrationLocationInput,
): Promise<void> {
  const conflicts = await findVenueRegistrationConflicts(prisma, input);
  if (conflicts.length === 0) return;
  const names = [...new Set(conflicts.map((item) => item.venueName))];
  throw new BadRequestException({
    code: 'VENUE_DUPLICATE_CANDIDATES',
    message:
      'Já existe estabelecimento com nome semelhante neste município. Revise duplicidades antes de criar outro cadastro.',
    duplicates: conflicts.map((item) => ({
      venueId: item.venueId,
      venueName: item.venueName,
      kind: item.kind,
    })),
    matchedNames: names,
  });
}