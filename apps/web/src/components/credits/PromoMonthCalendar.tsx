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
      <div className="row g-1 text-center small text-muted mb-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label) => (
          <div key={label} className="col">
            {label}
          </div>
        ))}
      </div>
      <div className="row g-1">
        {cells.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="col" style={{ flex: '0 0 14.28%', maxWidth: '14.28%' }} />
          }
          const key = formatDayKey(day)
          const disabled = day < today
          const selected = props.selected.has(key)
          return (
            <div key={key} className="col" style={{ flex: '0 0 14.28%', maxWidth: '14.28%' }}>
              <button
                type="button"
                className={`btn btn-sm w-100 ${selected ? 'btn-warning' : 'btn-outline-secondary'}`}
                disabled={disabled}
                onClick={() => props.onToggle(key)}
              >
                {day.getDate()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
