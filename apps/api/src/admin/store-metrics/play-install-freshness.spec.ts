import {
  playInstallCountsStale,
  playInstallDataLagDays,
} from './play-install-freshness';

describe('playInstallDataLagDays', () => {
  it('mede dias até hoje em UTC', () => {
    expect(
      playInstallDataLagDays('2026-11-18', new Date('2026-11-23T12:00:00Z')),
    ).toBe(5);
    expect(
      playInstallDataLagDays('2026-11-22', new Date('2026-11-23T12:00:00Z')),
    ).toBe(1);
  });
});

describe('playInstallCountsStale', () => {
  it('marca atraso a partir de 2 dias', () => {
    expect(
      playInstallCountsStale('2026-11-22', new Date('2026-11-23T12:00:00Z')),
    ).toBe(false);
    expect(
      playInstallCountsStale('2026-11-18', new Date('2026-11-23T12:00:00Z')),
    ).toBe(true);
  });
});