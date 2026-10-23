import {
  isVipPackageKey,
  normalizeAgeBandKey,
  normalizeCategoryKey,
} from './aggregates';

describe('admin aggregates helpers', () => {
  it('detecta pacotes VIP', () => {
    expect(isVipPackageKey('vip_unit_1')).toBe(true);
    expect(isVipPackageKey('VIP_UNIT_1')).toBe(true);
    expect(isVipPackageKey('unit_1')).toBe(false);
    expect(isVipPackageKey('welcome')).toBe(false);
  });

  it('normaliza faixa etária ausente', () => {
    expect(normalizeAgeBandKey(null)).toBe('UNKNOWN');
    expect(normalizeAgeBandKey(undefined)).toBe('UNKNOWN');
  });

  it('normaliza categoria ausente', () => {
    expect(normalizeCategoryKey(null)).toBe('Não informado');
    expect(normalizeCategoryKey('  ')).toBe('Não informado');
    expect(normalizeCategoryKey('Restaurantes')).toBe('Restaurantes');
  });
});
