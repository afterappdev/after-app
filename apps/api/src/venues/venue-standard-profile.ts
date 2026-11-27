import { StandardProfileStatus, VenueProfileKind } from '@prisma/client';
import { contactsStreetAddress } from '../common/utils/geo';
import {
  listVenuePublicationProfileGaps,
  venueHasValidHoursInterval,
  type VenuePublicationFields,
} from './venue-publication';

export const AFTER_STANDARD_OWNER_USER_ID = 'after_standard_venue_owner';
export const AFTER_STANDARD_OWNER_EMAIL =
  'after-standard-venues@internal.app-after.com.br';

export type VenueKindFields = VenuePublicationFields & {
  profileKind: VenueProfileKind;
  standardProfileStatus: StandardProfileStatus | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  publicacaoAutorizada?: boolean;
};

export function isStandardVenue(
  venue: Pick<VenueKindFields, 'profileKind'>,
): boolean {
  return venue.profileKind === VenueProfileKind.STANDARD;
}

export function isPublishedStandardVenue(
  venue: Pick<VenueKindFields, 'profileKind' | 'standardProfileStatus'>,
): boolean {
  return (
    venue.profileKind === VenueProfileKind.STANDARD &&
    venue.standardProfileStatus === StandardProfileStatus.PUBLISHED
  );
}

/** Minimum fields for a published standard profile (no cover/gallery). */
export function listStandardProfilePublicationGaps(
  venue: Pick<
    VenueKindFields,
    'name' | 'logoUrl' | 'category' | 'city' | 'state' | 'contacts' | 'hoursJson'
  >,
): string[] {
  const gaps: string[] = [];
  const name = venue.name?.trim() ?? '';
  if (name.length < 2) {
    gaps.push('nome do estabelecimento (mínimo 2 caracteres)');
  }
  const category = venue.category?.trim() ?? '';
  if (!category) {
    gaps.push('categoria');
  }
  const city = venue.city?.trim() ?? '';
  const state = venue.state?.trim() ?? '';
  if (!city || state.length < 2) {
    gaps.push('cidade e UF');
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

export function standardProfileReadyToPublish(
  venue: Pick<
    VenueKindFields,
    | 'name'
    | 'logoUrl'
    | 'category'
    | 'city'
    | 'state'
    | 'contacts'
    | 'hoursJson'
  >,
): boolean {
  return listStandardProfilePublicationGaps(venue).length === 0;
}

/** Discovery (search/browse): standard must be published; complete keeps full checklist. */
export function venueVisibleInConsumerDiscovery(
  venue: VenueKindFields,
): boolean {
  if (venue.moderationHiddenAt) return false;
  if (isStandardVenue(venue)) {
    return (
      isPublishedStandardVenue(venue) &&
      listStandardProfilePublicationGaps(venue).length === 0
    );
  }
  if (venue.publicacaoAutorizada === false) return false;
  return listVenuePublicationProfileGaps(venue).length === 0;
}

export function nearbyDiscoveryVenueFilter(
  venue: Pick<VenueKindFields, 'profileKind'>,
): boolean {
  return venue.profileKind === VenueProfileKind.COMPLETE;
}