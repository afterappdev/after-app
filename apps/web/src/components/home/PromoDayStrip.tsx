import { dayChipLabel } from '../../utils/dates'

type Props = {
  days: Date[]
  selected: Date
  today: Date
  onSelect: (day: Date) => void
  onPickDate: () => void
}

export function PromoDayStrip({ days, selected, today, onSelect, onPickDate }: Props) {
  return (
    <div className="d-flex gap-2 overflow-auto pb-1">
      {days.map((day) => {
        const active =
          day.getFullYear() === selected.getFullYear() &&
          day.getMonth() === selected.getMonth() &&
          day.getDate() === selected.getDate()
        return (
          <button
            key={day.toISOString()}
            type="button"
            className={`btn btn-sm flex-shrink-0 ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => onSelect(day)}
          >
            {dayChipLabel(day, today)}
          </button>
        )
      })}
      <button
        type="button"
        className="btn btn-sm btn-outline-primary flex-shrink-0"
        onClick={onPickDate}
      >
        Calendário
      </button>
    </div>
  )
}
