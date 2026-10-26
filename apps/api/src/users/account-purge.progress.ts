export const PURGE_PROGRESS = {
  ELIGIBILITY: 'ELIGIBILITY',
  FINANCIAL: 'FINANCIAL',
  MANIFEST: 'MANIFEST',
  DATA: 'DATA',
  UPLOADS: 'UPLOADS',
  DONE: 'DONE',
} as const;

export type PurgeProgressStage =
  (typeof PURGE_PROGRESS)[keyof typeof PURGE_PROGRESS];

const ORDER: PurgeProgressStage[] = [
  PURGE_PROGRESS.ELIGIBILITY,
  PURGE_PROGRESS.FINANCIAL,
  PURGE_PROGRESS.MANIFEST,
  PURGE_PROGRESS.DATA,
  PURGE_PROGRESS.UPLOADS,
  PURGE_PROGRESS.DONE,
];

export function purgeStageAtLeast(
  current: PurgeProgressStage | null | undefined,
  target: PurgeProgressStage,
): boolean {
  if (!current) return false;
  return ORDER.indexOf(current) >= ORDER.indexOf(target);
}

export function nextPurgeStage(
  current: PurgeProgressStage | null | undefined,
): PurgeProgressStage {
  if (!current) return PURGE_PROGRESS.ELIGIBILITY;
  const idx = ORDER.indexOf(current);
  return ORDER[Math.min(idx + 1, ORDER.length - 1)];
}
