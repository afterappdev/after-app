const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type DayHours = { open?: string; close?: string; closed?: boolean };

/**
 * hoursJson example:
 * {
 *   "mon": { "open": "10:00", "close": "22:00" },
 *   "tue": { "open": "10:00", "close": "22:00" },
 *   "sun": { "closed": true }
 * }
 */
export function computeIsOpen(
  hoursJson: unknown,
  now: Date = new Date(),
): boolean | null {
  if (!hoursJson || typeof hoursJson !== 'object') {
    return null;
  }

  const map = hoursJson as Record<string, DayHours>;
  const key = DAY_KEYS[now.getDay()];
  const day = map[key];
  if (!day) {
    return null;
  }
  if (day.closed) {
    return false;
  }
  if (!day.open || !day.close) {
    return null;
  }

  const current = now.getHours() * 60 + now.getMinutes();
  const open = parseHm(day.open);
  const close = parseHm(day.close);
  if (open === null || close === null) {
    return null;
  }

  // Overnight range (e.g. 18:00–02:00)
  if (close < open) {
    return current >= open || current < close;
  }
  return current >= open && current < close;
}

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
