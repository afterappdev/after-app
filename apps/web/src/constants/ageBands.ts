export type AgeBand =
  | 'AGE_0_18'
  | 'AGE_19_35'
  | 'AGE_36_50'
  | 'AGE_OVER_50'

export const AGE_BAND_OPTIONS: { value: AgeBand; label: string }[] = [
  { value: 'AGE_0_18', label: 'De 0 a 18 anos' },
  { value: 'AGE_19_35', label: 'De 19 a 35 anos' },
  { value: 'AGE_36_50', label: 'De 36 a 50 anos' },
  { value: 'AGE_OVER_50', label: 'Mais de 50 anos' },
]

export const AGE_BAND_REQUIRED_MESSAGE = 'Selecione a sua faixa etária.'
