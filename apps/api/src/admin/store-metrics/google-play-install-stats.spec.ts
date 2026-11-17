import {
  decodeCsvBytes,
  ingestDailyUserInstalls,
} from './google-play-install-stats';

describe('decodeCsvBytes', () => {
  it('decodifica UTF-16 LE com BOM', () => {
    const raw = 'Date,Daily User Installs\n2026-11-04,6';
    const buf = Buffer.from('\ufeff' + raw, 'utf16le');
    expect(decodeCsvBytes(buf).startsWith('Date,')).toBe(true);
  });
});

describe('ingestDailyUserInstalls', () => {
  it('soma daily por data sem duplicar', () => {
    const byDate = new Map<string, number>();
    const csvA = [
      'Date,Daily User Installs',
      '2026-10-01,5',
      '2026-10-02,3',
    ].join('\n');
    const csvB = [
      'Date,Daily User Installs',
      '2026-10-02,99',
      '2026-11-01,1',
    ].join('\n');
    ingestDailyUserInstalls(csvA, byDate);
    ingestDailyUserInstalls(csvB, byDate);
    expect(byDate.get('2026-10-02')).toBe(99);
    expect(byDate.get('2026-11-01')).toBe(1);
    let sum = 0;
    for (const n of byDate.values()) sum += n;
    expect(sum).toBe(105);
  });
});