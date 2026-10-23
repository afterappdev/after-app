import { BadRequestException } from '@nestjs/common';
import {
  resolveVenueDocument,
  VENUE_DOCUMENT_REQUIRED,
  type VenueDocument,
} from '../venues/venue-document';
import {
  AGE_BAND_REQUIRED,
  resolveUserAgeBand,
  type AgeBandName,
} from '../users/age-band';

/** Declared only by After Web clients. Native store apps never send this. */
export const WEB_REGISTRATION_CHANNEL = 'after_web';

export type RegistrationProfileInput = {
  ageBand?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  registrationChannel?: string | null;
};

export type RegistrationRole = 'USER' | 'VENUE';

export type RegistrationProfileMode = 'legacy_mobile' | 'enriched';

export type ResolvedRegistrationProfile = {
  mode: RegistrationProfileMode;
  ageBand: AgeBandName | null;
  venueDocument: VenueDocument | null;
};

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

export function hasAnyRegistrationProfileField(
  input: RegistrationProfileInput,
): boolean {
  return (
    !isBlank(input.ageBand) ||
    !isBlank(input.documentType) ||
    !isBlank(input.documentNumber)
  );
}

export function normalizeRequestOrigin(origin: string | undefined): string | null {
  const raw = (origin ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export function isAllowedWebOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  const normalized = normalizeRequestOrigin(origin);
  if (!normalized) return false;
  const allowed = new Set(
    allowedOrigins
      .map((item) => normalizeRequestOrigin(item))
      .filter((item): item is string => Boolean(item)),
  );
  return allowed.has(normalized);
}

export function declaresWebRegistration(
  input: RegistrationProfileInput,
  origin: string | undefined,
  allowedWebOrigins: readonly string[],
): boolean {
  if (input.registrationChannel === WEB_REGISTRATION_CHANNEL) return true;
  return isAllowedWebOrigin(origin, allowedWebOrigins);
}

/**
 * Legacy mobile = same payload shape as Android 1.0.1 / iOS 1.0.2 store builds:
 * no profile fields and no web channel/origin.
 *
 * Web and partial payloads must satisfy the enriched rules. A spoofed client
 * cannot omit fields while claiming a web Origin without matching allowed origins.
 */
export function resolveRegistrationProfile(
  role: RegistrationRole,
  input: RegistrationProfileInput,
  origin: string | undefined,
  allowedWebOrigins: readonly string[],
): ResolvedRegistrationProfile {
  const web = declaresWebRegistration(input, origin, allowedWebOrigins);
  const anyProfileField = hasAnyRegistrationProfileField(input);

  if (web || anyProfileField) {
    if (role === 'USER') {
      return {
        mode: 'enriched',
        ageBand: resolveUserAgeBand(input.ageBand),
        venueDocument: null,
      };
    }
    return {
      mode: 'enriched',
      ageBand: null,
      venueDocument: resolveVenueDocument(input),
    };
  }

  return { mode: 'legacy_mobile', ageBand: null, venueDocument: null };
}

export function assertEnrichedRegistrationComplete(
  role: RegistrationRole,
  input: RegistrationProfileInput,
  origin: string | undefined,
  allowedWebOrigins: readonly string[],
): void {
  const web = declaresWebRegistration(input, origin, allowedWebOrigins);
  if (!web) return;
  if (role === 'USER' && isBlank(input.ageBand)) {
    throw new BadRequestException(AGE_BAND_REQUIRED);
  }
  if (role === 'VENUE' && (isBlank(input.documentType) || isBlank(input.documentNumber))) {
    throw new BadRequestException(VENUE_DOCUMENT_REQUIRED);
  }
}
