/** Labels offered in the venue edit dropdown. Alphabetical in pt-BR. */
export const VENUE_MUSIC_STYLES = [
  'Axé',
  'Eclético',
  'Eletrônica',
  'Flashback',
  'Forró',
  'Funk',
  'Hip Hop',
  'Latino',
  'MPB',
  'Pagode',
  'Pop',
  'Reggae',
  'Rock',
  'Samba',
  'Sertanejo',
  'Trap',
] as const;

const ALLOWED = new Set<string>(VENUE_MUSIC_STYLES);

/**
 * Value written to Venue.musicStyle.
 * Empty clears. Unknown input returns undefined so the caller can reject it.
 */
export function storedMusicStyle(
  value: string | null | undefined,
): string | null | undefined {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return ALLOWED.has(trimmed) ? trimmed : undefined;
}
