import {
  monthRangeUtc,
  parseYmd,
  yearMonthInTimeZone,
  zonedDateTimeToUtc,
} from './timezone';

describe('America/Sao_Paulo month boundaries', () => {
  it('resolve 2026-09-01 00:00 SP as 03:00 UTC', () => {
    const start = zonedDateTimeToUtc(2026, 9, 1, 0, 0, 0);
    expect(start.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('um instante 1s antes da virada ainda é agosto em SP', () => {
    const instant = new Date('2026-09-01T02:59:59.000Z');
    expect(yearMonthInTimeZone(instant)).toEqual({ year: 2026, month: 8 });
  });

  it('o início de setembro em UTC-3 já é setembro', () => {
    const instant = new Date('2026-09-01T03:00:00.000Z');
    expect(yearMonthInTimeZone(instant)).toEqual({ year: 2026, month: 9 });
  });

  it('monthRangeUtc de setembro 2026 cobre [01 00:00 SP, 01 out 00:00 SP)', () => {
    const { start, end } = monthRangeUtc({ year: 2026, month: 9 });
    expect(start.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  it('rejeita data calendário inválida', () => {
    expect(() => parseYmd('2026-02-31')).toThrow(/inválida/);
  });
});
