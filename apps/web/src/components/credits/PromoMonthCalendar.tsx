type Props = {
  month: Date
  selected: Set<string>
  onToggle: (dayKey: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

export function formatDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function PromoMonthCalendar(props: Props) {
  const year = props.month.getFullYear()
  const monthIndex = props.month.getMonth()
  const first = new Date(year, monthIndex, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const today = startOfDay(new Date())
  const monthLabel = props.month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(new Date(year, monthIndex, d))
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onPrevMonth}>
          ‹
        </button>
        <span className="text-capitalize fw-semibold small">{monthLabel}</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={props.onNextMonth}>
          ›
        </button>
      </div>
      <div className="pub-cal-week pub-cal-weekdays text-center small text-muted">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => (
          <div key={`${label}-${index}`}>{label}</div>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div key={`week-${weekIndex}`} className="pub-cal-week">
          {week.map((day, dayIndex) => {
            if (!day) {
              return <div key={`empty-${weekIndex}-${dayIndex}`} aria-hidden />
            }
            const key = formatDayKey(day)
            const disabled = day < today
            const selected = props.selected.has(key)
            return (
              <button
                key={key}
                type="button"
                className={`btn btn-sm w-100 ${selected ? 'btn-warning' : 'btn-outline-secondary'}`}
                disabled={disabled}
                onClick={() => props.onToggle(key)}
              >
                {day.getDate()}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
