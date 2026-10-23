import { BUSINESS_TIME_ZONE } from '../common/constants/timezone';

/** Civil calendar day in America/Sao_Paulo, stored as UTC midnight. */
export function civilDateUtc(now: Date, timeZone = BUSINESS_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

function zoneOffsetMs(utcGuess: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utcGuess);
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  let hour = Number(map.hour);
  let day = Number(map.day);
  if (hour === 24) {
    hour = 0;
    day += 1;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    day,
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - utcGuess.getTime();
}

/** UTC instant when the civil day starts in America/Sao_Paulo. */
export function startOfCivilDayUtc(
  year: number,
  month: number,
  day: number,
  timeZone = BUSINESS_TIME_ZONE,
): Date {
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = new Date(utcMidnight);
  let offset = zoneOffsetMs(guess, timeZone);
  guess = new Date(utcMidnight - offset);
  offset = zoneOffsetMs(guess, timeZone);
  return new Date(utcMidnight - offset);
}

export function civilDayWindow(
  displayDate: Date,
  timeZone = BUSINESS_TIME_ZONE,
): { availableAt: Date; expiresAt: Date } {
  const year = displayDate.getUTCFullYear();
  const month = displayDate.getUTCMonth() + 1;
  const day = displayDate.getUTCDate();
  const availableAt = startOfCivilDayUtc(year, month, day, timeZone);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const expiresAt = startOfCivilDayUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { availableAt, expiresAt };
}

/** Negative when the schedule's civil day is already over. displayDate is UTC midnight. */
export function compareCivilDay(displayDate: Date, now: Date): number {
  const scheduled = Date.UTC(
    displayDate.getUTCFullYear(),
    displayDate.getUTCMonth(),
    displayDate.getUTCDate(),
  );
  return scheduled - civilDateUtc(now).getTime();
}
