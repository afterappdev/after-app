export type VipPushTimingChoice = 'IMMEDIATE' | 'SLOT_11' | 'SLOT_17'

const BUSINESS_TZ = 'America/Sao_Paulo'
const SLOT_11 = 11 * 60
const SLOT_17 = 17 * 60
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function civilDateLabelSp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${y}-${mo}-${d}`
}

export function minutesSinceMidnightSp(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

export function allowedVipPushTimingsForDate(
  displayDate: string,
  now = new Date(),
): VipPushTimingChoice[] {
  if (!DATE_RE.test(displayDate)) return []
  const today = civilDateLabelSp(now)
  const cmp = displayDate.localeCompare(today)
  if (cmp < 0) return []
  if (cmp > 0) return ['SLOT_11', 'SLOT_17']
  const minutes = minutesSinceMidnightSp(now)
  if (minutes < SLOT_11) return ['SLOT_11', 'SLOT_17']
  if (minutes < SLOT_17) return ['SLOT_17', 'IMMEDIATE']
  return ['IMMEDIATE']
}

export function labelVipPushTiming(timing: VipPushTimingChoice): string {
  switch (timing) {
    case 'IMMEDIATE':
      return 'Envio imediato'
    case 'SLOT_11':
      return '11:00 (horário oficial)'
    case 'SLOT_17':
      return '17:00 (horário oficial)'
  }
}
