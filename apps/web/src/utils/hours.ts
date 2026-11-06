export const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
]

const LONG_LABEL: Record<string, string> = {
  mon: 'Segunda-feira',
  tue: 'Terça-feira',
  wed: 'Quarta-feira',
  thu: 'Quinta-feira',
  fri: 'Sexta-feira',
  sat: 'Sábado',
  sun: 'Domingo',
}

export type HoursRow = { day: string; hours: string }

type Slot = { open?: string; close?: string }

function formatSlot(open: string, close: string): string {
  return `${open} – ${close}`
}

function normalizeDay(value: unknown): { closed: boolean; slots: Slot[] } | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (row.closed === true) return { closed: true, slots: [] }
  const periods = row.periods
  if (Array.isArray(periods) && periods.length > 0) {
    const slots = periods
      .filter((p) => p && typeof p === 'object')
      .map((p) => p as Slot)
      .filter((p) => p.open && p.close)
    if (slots.length === 0) return null
    return { closed: false, slots }
  }
  if (row.open && row.close) {
    return { closed: false, slots: [{ open: String(row.open), close: String(row.close) }] }
  }
  return null
}

export function parseHoursRows(
  hoursJson: Record<string, unknown> | null | undefined,
): HoursRow[] {
  if (!hoursJson) {
    return [{ day: '', hours: 'Horário não informado.' }]
  }
  return DAYS.map(({ key, label }) => {
    const dayLabel = LONG_LABEL[key] ?? label
    const norm = normalizeDay(hoursJson[key])
    if (!norm) return { day: dayLabel, hours: 'Fechado' }
    if (norm.closed) return { day: dayLabel, hours: 'Fechado' }
    return {
      day: dayLabel,
      hours: norm.slots.map((s) => formatSlot(String(s.open), String(s.close))).join(' · '),
    }
  })
}
