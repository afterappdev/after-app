const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
]

export type HoursRow = { day: string; hours: string }

export function parseHoursRows(
  hoursJson: Record<string, unknown> | null | undefined,
): HoursRow[] {
  if (!hoursJson) {
    return [{ day: '', hours: 'Horário não informado.' }]
  }
  return DAYS.map(({ key, label }) => {
    const value = hoursJson[key]
    if (!value || typeof value !== 'object') {
      return { day: label, hours: 'Fechado' }
    }
    const row = value as Record<string, unknown>
    if (row.closed === true) return { day: label, hours: 'Fechado' }
    const open = row.open?.toString()
    const close = row.close?.toString()
    if (open && close) return { day: label, hours: `${open} – ${close}` }
    return { day: label, hours: 'Fechado' }
  })
}
