import { IconCalendar } from '../icons/AfterIcons'
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
    <div className="home-day-strip">
      {days.map((day) => {
        const active =
          day.getFullYear() === selected.getFullYear() &&
          day.getMonth() === selected.getMonth() &&
          day.getDate() === selected.getDate()
        return (
          <button
            key={day.toISOString()}
            type="button"
            className={`home-day-chip ${active ? 'home-day-chip--active' : ''}`}
            onClick={() => onSelect(day)}
          >
            {dayChipLabel(day, today)}
          </button>
        )
      })}
      <button type="button" className="home-calendar-btn" onClick={onPickDate} aria-label="Calendário">
        <IconCalendar />
      </button>
    </div>
  )
}
