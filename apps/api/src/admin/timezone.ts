/** Business calendar for After Admin metrics. */
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

export type YearMonth = {
  year: number;
  month: number;
};

export type Ymd = {
  year: number;
  month: number;
  day: number;
};

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatYearMonth(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month };
}

export function yearMonthInTimeZone(
  date: Date,
  timeZone = BUSINESS_TIME_ZONE,
): YearMonth {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error('Não foi possível resolver o mês no fuso de negócio.');
  }
  return { year, month };
}

export function lastYearMonths(
  count: number,
  now = new Date(),
  timeZone = BUSINESS_TIME_ZONE,
): YearMonth[] {
  const current = yearMonthInTimeZone(now, timeZone);
  const months: YearMonth[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(addMonths(current, -i));
  }
  return months;
}

/**
 * Instant that corresponds to local wall time in `timeZone`.
 * Handles DST by reconciling the timezone offset twice.
 */
export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone = BUSINESS_TIME_ZONE,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  let instant = utcGuess - offset;
  const offset2 = timeZoneOffsetMs(new Date(instant), timeZone);
  if (offset2 !== offset) {
    instant = utcGuess - offset2;
  }
  return new Date(instant);
}

export function monthRangeUtc(
  ym: YearMonth,
  timeZone = BUSINESS_TIME_ZONE,
): { start: Date; end: Date } {
  const start = zonedDateTimeToUtc(ym.year, ym.month, 1, 0, 0, 0, timeZone);
  const next = addMonths(ym, 1);
  const end = zonedDateTimeToUtc(next.year, next.month, 1, 0, 0, 0, timeZone);
  return { start, end };
}

export function parseYmd(value: string): Ymd {
  const match = YMD_RE.exec(value.trim());
  if (!match) {
    throw new RangeError('Data inválida. Use YYYY-MM-DD.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError('Data inválida. Use YYYY-MM-DD.');
  }
  return { year, month, day };
}

/** Inclusive calendar `from`/`to` in the business timezone → UTC [start, end). */
export function inclusiveDateRangeUtc(
  fromYmd: string | undefined,
  toYmd: string | undefined,
  timeZone = BUSINESS_TIME_ZONE,
): { start?: Date; end?: Date } {
  const from = fromYmd ? parseYmd(fromYmd) : undefined;
  const to = toYmd ? parseYmd(toYmd) : undefined;
  if (from && to) {
    const fromKey = from.year * 10000 + from.month * 100 + from.day;
    const toKey = to.year * 10000 + to.month * 100 + to.day;
    if (fromKey > toKey) {
      throw new RangeError('from não pode ser posterior a to.');
    }
  }
  const nextTo = to ? addCalendarDays(to, 1) : undefined;
  return {
    start: from
      ? zonedDateTimeToUtc(from.year, from.month, from.day, 0, 0, 0, timeZone)
      : undefined,
    end: nextTo
      ? zonedDateTimeToUtc(
          nextTo.year,
          nextTo.month,
          nextTo.day,
          0,
          0,
          0,
          timeZone,
        )
      : undefined,
  };
}

function addCalendarDays(ymd: Ymd, days: number): Ymd {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return asUtc - date.getTime();
}
