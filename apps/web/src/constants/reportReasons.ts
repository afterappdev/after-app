import type { ReportReason } from '../api/reports'

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'INAPPROPRIATE', label: 'Conteúdo impróprio ou ofensivo' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'MISLEADING', label: 'Informação falsa ou enganosa' },
  { value: 'VIOLENCE', label: 'Violência ou conteúdo perigoso' },
  { value: 'SEXUAL', label: 'Conteúdo sexual ou impróprio' },
  { value: 'HATE', label: 'Discurso de ódio ou assédio' },
  { value: 'COPYRIGHT', label: 'Violação de direitos autorais' },
  { value: 'OTHER', label: 'Outro' },
]

export const REPORT_SUCCESS_MESSAGE =
  'Denúncia enviada. Obrigado por nos ajudar a manter o After seguro.'
