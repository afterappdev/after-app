import { BadRequestException } from '@nestjs/common';

export const AGE_BANDS = [
  'AGE_0_18',
  'AGE_19_35',
  'AGE_36_50',
  'AGE_OVER_50',
] as const;

export type AgeBandName = (typeof AGE_BANDS)[number];

export const AGE_BAND_REQUIRED = 'Selecione a sua faixa etária.';
export const AGE_BAND_INVALID = 'Faixa etária inválida.';

const BANDS = new Set<string>(AGE_BANDS);

/**
 * Self-reported range. It does not prove the person is 18 or older
 * and must not authorize restricted content.
 */
export function resolveUserAgeBand(value: string | null | undefined): AgeBandName {
  const band = (value ?? '').trim();
  if (!band) {
    throw new BadRequestException(AGE_BAND_REQUIRED);
  }
  if (!BANDS.has(band)) {
    throw new BadRequestException(AGE_BAND_INVALID);
  }
  return band as AgeBandName;
}
