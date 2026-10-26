import { AccountPurgeJobStatus } from '@prisma/client';

/**
 * Allowed transitions (Phase F — no COMPLETED from scheduler until Phase G):
 *
 * PENDING → PROCESSING (claim)
 * FAILED → PROCESSING (claim / retry)
 * PROCESSING → PENDING (simulation release, ineligible revalidation, lease cooldown)
 * PROCESSING → FAILED (processing error)
 * PROCESSING → COMPLETED (Phase G only — destructive success)
 * PENDING | FAILED | PROCESSING → CANCELLED (account recovery / lifecycle)
 *
 * Terminal: COMPLETED, CANCELLED (not claimed)
 */
export const PURGE_CLAIMABLE_STATUSES: AccountPurgeJobStatus[] = [
  AccountPurgeJobStatus.PENDING,
  AccountPurgeJobStatus.FAILED,
];

export const PURGE_TERMINAL_STATUSES: AccountPurgeJobStatus[] = [
  AccountPurgeJobStatus.COMPLETED,
  AccountPurgeJobStatus.CANCELLED,
];
