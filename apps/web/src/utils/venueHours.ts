import { DAYS } from './hours'

/** Um intervalo de funcionamento no mesmo dia civil. */
export type TimeSlot = {
  open: string
  close: string
}

export type HoursMode = 'single' | 'split'

export type DayHours = {
  closed: boolean
  /** Ignorado se closed. Pelo menos um período quando aberto. */
  periods: TimeSlot[]
}

export type HoursFormState = {
  mode: HoursMode
  days: Record<string, DayHours>
}

const META_KEY = '_hoursMeta'

type LegacyDay = {
  open?: string
  close?: string
  closed?: boolean
  periods?: TimeSlot[]
}

function normalizeTime(value: string): string {
  const trimmed = value.trim()
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (!match) return trimmed
  const h = match[1].padStart(2, '0')
  return `${h}:${match[2]}`
}

function defaultSlot(): TimeSlot {
  return { open: '10:00', close: '22:00' }
}

export function createDefaultHoursForm(): HoursFormState {
  const days: Record<string, DayHours> = {}
  for (const { key } of DAYS) {
    days[key] = { closed: false, periods: [defaultSlot()] }
  }
  return { mode: 'single', days }
}

function parseLegacyDay(value: unknown): DayHours | null {
  if (!value || typeof value !== 'object') return null
  const row = value as LegacyDay
  if (row.closed === true) {
    return { closed: true, periods: [defaultSlot()] }
  }
  if (Array.isArray(row.periods) && row.periods.length > 0) {
    const periods = row.periods
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        open: p.open != null ? normalizeTime(String(p.open)) : '10:00',
        close: p.close != null ? normalizeTime(String(p.close)) : '22:00',
      }))
    if (periods.length > 0) {
      return { closed: false, periods }
    }
  }
  if (row.open != null && row.close != null) {
    return {
      closed: false,
      periods: [{ open: normalizeTime(String(row.open)), close: normalizeTime(String(row.close)) }],
    }
  }
  return null
}

function inferModeFromDays(days: Record<string, DayHours>): HoursMode {
  for (const { key } of DAYS) {
    const d = days[key]
    if (d && !d.closed && d.periods.length > 1) return 'split'
  }
  return 'single'
}

export function parseHoursForm(
  hoursJson: Record<string, unknown> | null | undefined,
): HoursFormState {
  const base = createDefaultHoursForm()
  if (!hoursJson) return base

  const meta = hoursJson[META_KEY]
  let mode: HoursMode = 'single'
  if (meta && typeof meta === 'object' && 'mode' in meta) {
    const m = (meta as { mode?: string }).mode
    if (m === 'split' || m === 'single') mode = m
  }

  const days: Record<string, DayHours> = { ...base.days }
  for (const { key } of DAYS) {
    const parsed = parseLegacyDay(hoursJson[key])
    if (parsed) days[key] = parsed
  }

  if (!meta || typeof meta !== 'object') {
    mode = inferModeFromDays(days)
  }

  for (const { key } of DAYS) {
    const d = days[key]
    if (d.closed) continue
    if (mode === 'single' && d.periods.length > 1) {
      days[key] = { ...d, periods: [d.periods[0]] }
    }
    if (mode === 'split' && d.periods.length === 0) {
      days[key] = { closed: false, periods: [defaultSlot(), { open: '18:00', close: '23:00' }] }
    }
    if (mode === 'split' && d.periods.length === 1) {
      days[key] = { ...d, periods: [...d.periods, { open: '18:00', close: '23:00' }] }
    }
  }

  return { mode, days }
}

export function buildHoursJson(form: HoursFormState): Record<string, unknown> {
  const map: Record<string, unknown> = {
    [META_KEY]: { mode: form.mode },
  }
  for (const { key } of DAYS) {
    const row = form.days[key]
    if (!row) continue
    if (row.closed) {
      map[key] = { closed: true }
      continue
    }
    const periods = row.periods.map((p) => ({
      open: normalizeTime(p.open),
      close: normalizeTime(p.close),
    }))
    if (periods.length === 1) {
      map[key] = { open: periods[0].open, close: periods[0].close }
    } else {
      map[key] = { closed: false, periods }
    }
  }
  return map
}
