import { Prisma } from '@prisma/client';
import { contactsStreetAddress } from '../common/utils/geo';
import { DAY_KEYS, parseWallClockHm } from '../common/utils/hours';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { publicVenueWhere } from '../common/moderation/audience';
import { isEventPromoterCategory } from './venue-categories';

export type VenuePublicationFields = {
  ownerUserId: string;
  moderationHiddenAt: Date | null;
  category?: string | null;
  name: string;
  logoUrl: string | null;
  coverUrl?: string | null;
  contacts: unknown;
  hoursJson: unknown;
};

/** Prisma filter for guest discovery lists (moderation). Profile checklist runs in app code. */
export function strangerDiscoveryVenueWhere(
  blockedIds: string[] = [],
): Prisma.VenueWhereInput {
  return publicVenueWhere(blockedIds);
}

export function filterVenuesForStrangerDiscovery<
  T extends VenuePublicationFields,
>(venues: T[]): T[] {
  return venues.filter((venue) => venueVisibleToStrangerDiscovery(venue));
}

type DayHours = {
  open?: string;
  close?: string;
  closed?: boolean;
  periods?: { open?: string; close?: string }[];
};

function validHmPair(open: string, close: string): boolean {
  if (!open || !close) return false;
  const o = parseWallClockHm(open);
  const c = parseWallClockHm(close);
  if (o === null || c === null) return false;
  if (o === c) return false;
  return true;
}

function validOpeningInterval(day: DayHours): boolean {
  if (day.closed === true) return false;
  const periods = day.periods;
  if (Array.isArray(periods) && periods.length > 0) {
    return periods.some((p) => {
      const open = p.open?.trim() ?? '';
      const close = p.close?.trim() ?? '';
      return validHmPair(open, close);
    });
  }
  const open = day.open?.trim() ?? '';
  const close = day.close?.trim() ?? '';
  return validHmPair(open, close);
}

/** At least one calendar day with parsable open/close (legacy hoursJson shape). */
export function venueHasValidHoursInterval(hoursJson: unknown): boolean {
  if (!hoursJson || typeof hoursJson !== 'object' || Array.isArray(hoursJson)) {
    return false;
  }
  const map = hoursJson as Record<string, DayHours>;
  for (const key of DAY_KEYS) {
    const day = map[key];
    if (day && typeof day === 'object' && validOpeningInterval(day)) {
      return true;
    }
  }
  return false;
}

/** Profile-only gaps (nome, logo, endereço, horários). ADMIN authorize uses this. */
export function listVenuePublicationProfileGaps(
  venue: Pick<
    VenuePublicationFields,
    'name' | 'logoUrl' | 'coverUrl' | 'contacts' | 'hoursJson'
  >,
): string[] {
  const gaps: string[] = [];
  const name = venue.name?.trim() ?? '';
  if (name.length < 2) {
    gaps.push('nome do estabelecimento (mínimo 2 caracteres)');
  }
  const logo = venue.logoUrl?.trim() ?? '';
  if (!logo) {
    gaps.push('logo cadastrada');
  }
  const cover = venue.coverUrl?.trim() ?? '';
  if (!cover) {
    gaps.push('foto de capa cadastrada');
  }
  const address = contactsStreetAddress(venue.contacts);
  if (address.length < 2) {
    gaps.push('endereço no perfil (campo address em contacts)');
  }
  if (!venueHasValidHoursInterval(venue.hoursJson)) {
    gaps.push('ao menos um dia com horário aberto válido (open/close HH:MM, não fechado)');
  }
  return gaps;
}

/** Full stranger-visible rule: not moderated away, flag on, profile complete. */
export function venueVisibleToStrangerDiscovery(venue: VenuePublicationFields): boolean {
  if (venue.moderationHiddenAt) return false;
  if (isEventPromoterCategory(venue.category)) return true;
  return listVenuePublicationProfileGaps(venue).length === 0;
}

/**
 * Strangers need full manual checklist. Owner and ADMIN always read the venue
 * (moderation still hides everyone in getPublic — unchanged).
 */
export function canSeeVenueInDiscoveryContext(
  venue: VenuePublicationFields,
  user?: Pick<AuthUser, 'userId' | 'role'> | null,
): boolean {
  if (user?.role === 'ADMIN') return true;
  if (user?.role === 'VENUE' && user.userId === venue.ownerUserId) return true;
  return venueVisibleToStrangerDiscovery(venue);
}
