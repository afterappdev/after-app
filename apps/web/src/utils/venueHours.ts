import { DAYS } from './hours'

export type DayHours = {
  closed: boolean
  open: string
  close: string
}

export type HoursFormState = Record<string, DayHours>

export function createDefaultHoursForm(): HoursFormState {
  const state: HoursFormState = {}
  for (const { key } of DAYS) {
    state[key] = { closed: false, open: '10:00', close: '22:00' }
  }
  return state
}

function normalizeTime(value: string): string {
  const trimmed = value.trim()
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (!match) return trimmed
  const h = match[1].padStart(2, '0')
  return `${h}:${match[2]}`
}

export function parseHoursForm(
  hoursJson: Record<string, unknown> | null | undefined,
): HoursFormState {
  const base = createDefaultHoursForm()
  if (!hoursJson) return base
  for (const { key } of DAYS) {
    const value = hoursJson[key]
    if (!value || typeof value !== 'object') continue
    const row = value as Record<string, unknown>
    if (row.closed === true) {
      base[key] = { closed: true, open: '10:00', close: '22:00' }
      continue
    }
    base[key] = {
      closed: false,
      open: row.open != null ? normalizeTime(String(row.open)) : '10:00',
      close: row.close != null ? normalizeTime(String(row.close)) : '22:00',
    }
  }
  return base
}

export function buildHoursJson(form: HoursFormState): Record<string, unknown> {
  const map: Record<string, unknown> = {}
  for (const { key } of DAYS) {
    const row = form[key]
    if (!row) continue
    if (row.closed) {
      map[key] = { closed: true }
    } else {
      map[key] = {
        open: normalizeTime(row.open),
        close: normalizeTime(row.close),
      }
    }
  }
  return map
}
