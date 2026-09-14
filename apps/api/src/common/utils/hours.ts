import { BUSINESS_TIME_ZONE } from '../constants/timezone';

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export type DayKey = (typeof DAY_KEYS)[number];

type DayHours = { open?: string; close?: string; closed?: boolean };

const WEEKDAY_SHORT: Record<string, DayKey> = {
  sun: 'sun',
  mon: 'mon',
  tue: 'tue',
  wed: 'wed',
  thu: 'thu',
  fri: 'fri',
  sat: 'sat',
};

export type BusinessWallClock = {
  weekday: DayKey;
  hour: number;
  minute: number;
};

/**
 * Wall clock in the After business timezone. Independent of process TZ.
 */
export function businessWallClock(
  now: Date,
  timeZone = BUSINESS_TIME_ZONE,
): BusinessWallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const weekdayRaw = (
    parts.find((part) => part.type === 'weekday')?.value ?? ''
  )
    .slice(0, 3)
    .toLowerCase();
  const weekday = WEEKDAY_SHORT[weekdayRaw];
  let hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);

  if (!weekday || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('Não foi possível resolver o relógio no fuso de negócio.');
  }
  if (hour === 24) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Não foi possível resolver o relógio no fuso de negócio.');
  }
  return { weekday, hour, minute };
}

export function previousDayKey(key: DayKey): DayKey {
  const index = DAY_KEYS.indexOf(key);
  return DAY_KEYS[(index + 6) % 7];
}

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
  const wall = businessWallClock(now);
  const current = wall.hour * 60 + wall.minute;

  if (isOpenFromPreviousOvernight(map[previousDayKey(wall.weekday)], current)) {
    return true;
  }

  const day = map[wall.weekday];
  if (!day) {
    return null;
  }
  return isOpenOnCalendarDay(day, current);
}

function isOpenFromPreviousOvernight(
  previous: DayHours | undefined,
  currentMinutes: number,
): boolean {
  if (!previous || previous.closed) {
    return false;
  }
  if (!previous.open || !previous.close) {
    return false;
  }
  const open = parseHm(previous.open);
  const close = parseHm(previous.close);
  if (open === null || close === null) {
    return false;
  }
  if (close >= open) {
    return false;
  }
  return currentMinutes < close;
}

function isOpenOnCalendarDay(
  day: DayHours,
  currentMinutes: number,
): boolean | null {
  if (day.closed) {
    return false;
  }
  if (!day.open || !day.close) {
    return null;
  }

  const open = parseHm(day.open);
  const close = parseHm(day.close);
  if (open === null || close === null) {
    return null;
  }

  if (close < open) {
    return currentMinutes >= open;
  }
  return currentMinutes >= open && currentMinutes < close;
}

function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
