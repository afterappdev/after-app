import { Prisma } from '@prisma/client';

export type AudienceCandidate = {
  id: string;
  role: 'USER' | 'VENUE' | 'ADMIN';
  promoNotificationsEnabled: boolean;
  ibgeCityId: number | null;
  lastAuthorizedIbgeCityId: number | null;
  lastAuthorizedCityAt: Date | null;
  blocked: boolean;
  tokens: { id: string; token: string; disabledAt: Date | null }[];
};

export function promoAudienceWhere(input: {
  ibgeCityId: number;
  freshAfter: Date;
  venueId: string;
  allowlist: string[] | null;
}): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    role: 'USER',
    promoNotificationsEnabled: true,
    venueBlocks: { none: { venueId: input.venueId } },
    OR: [
      { ibgeCityId: input.ibgeCityId },
      {
        lastAuthorizedIbgeCityId: input.ibgeCityId,
        lastAuthorizedCityAt: { gte: input.freshAfter },
      },
    ],
  };
  if (input.allowlist) {
    where.id = { in: input.allowlist };
  }
  return where;
}

export function selectPromoAudience(input: {
  candidates: AudienceCandidate[];
  ibgeCityId: number;
  now: Date;
  locationMaxAgeMs: number;
  maxPerDay: number;
  recentEventCounts: Map<string, number>;
}): { selected: AudienceCandidate[]; skippedByCap: string[] } {
  const selected: AudienceCandidate[] = [];
  const skippedByCap: string[] = [];
  const seen = new Set<string>();
  for (const candidate of input.candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (candidate.role !== 'USER') continue;
    if (!candidate.promoNotificationsEnabled) continue;
    if (candidate.blocked) continue;
    const registered = candidate.ibgeCityId === input.ibgeCityId;
    const detectedAt = candidate.lastAuthorizedCityAt;
    const age =
      detectedAt == null
        ? Number.POSITIVE_INFINITY
        : input.now.getTime() - detectedAt.getTime();
    const fresh =
      candidate.lastAuthorizedIbgeCityId === input.ibgeCityId &&
      detectedAt != null &&
      age >= 0 &&
      age <= input.locationMaxAgeMs;
    if (!registered && !fresh) continue;
    const recent = input.recentEventCounts.get(candidate.id) ?? 0;
    if (recent >= input.maxPerDay) {
      skippedByCap.push(candidate.id);
      continue;
    }
    selected.push(candidate);
  }
  return { selected, skippedByCap };
}

export function canClaimPromoPushEvent(
  event: {
    status: string;
    availableAt: Date;
    expiresAt: Date;
    lockedUntil: Date | null;
  },
  now: Date,
): boolean {
  if (event.availableAt.getTime() > now.getTime()) return false;
  if (event.expiresAt.getTime() <= now.getTime()) return false;
  if (event.status !== 'PENDING' && event.status !== 'PROCESSING') return false;
  if (event.lockedUntil && event.lockedUntil.getTime() >= now.getTime()) {
    return false;
  }
  return true;
}
