export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatDateQuery(day: Date): string {
  const m = String(day.getMonth() + 1).padStart(2, '0')
  const d = String(day.getDate()).padStart(2, '0')
  return `${day.getFullYear()}-${m}-${d}`
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function dayChipLabel(day: Date, today: Date): string {
  if (isSameDay(day, today)) return 'Hoje'
  const wd = WEEKDAY_SHORT[day.getDay()]
  const d = String(day.getDate()).padStart(2, '0')
  const m = String(day.getMonth() + 1).padStart(2, '0')
  return `${wd} ${d}/${m}`
}

export function formatStoredCalendarDate(value: unknown): string {
  if (!value) return ''
  const text = String(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (!match) return text
  return `${match[3]}/${match[2]}/${match[1]}`
}

export function promoFilterDays(selected: Date, today: Date, span = 14): Date[] {
  const days: Date[] = []
  for (let i = 0; i < span; i += 1) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d)
  }
  if (!days.some((d) => isSameDay(d, selected))) {
    days.push(new Date(selected))
    days.sort((a, b) => a.getTime() - b.getTime())
  }
  return days
}
