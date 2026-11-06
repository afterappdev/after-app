import { IconCalendar } from '../icons/AfterIcons'
import { DAYS } from '../../utils/hours'
import type { HoursFormState, HoursMode, TimeSlot } from '../../utils/venueHours'

function defaultPeriod(index: number): TimeSlot {
  if (index === 0) return { open: '11:00', close: '14:30' }
  return { open: '18:00', close: '23:00' }
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

function parseHm(iso: string): { h: string; m: string } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(iso.trim())
  if (!match) return { h: '10', m: '00' }
  const h = match[1].padStart(2, '0')
  let m = match[2]
  if (!MINUTE_OPTIONS.includes(m)) m = '00'
  return { h, m }
}

function joinHm(h: string, m: string): string {
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

function TimeHmSelects({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
}) {
  const { h, m } = parseHm(value)
  return (
    <div className="hours-time-hm" role="group" aria-label={ariaLabel}>
      <select
        className="form-select form-select-sm hours-time-select hours-time-select--hour"
        value={h}
        aria-label={`${ariaLabel} — hora`}
        onChange={(e) => onChange(joinHm(e.target.value, m))}
      >
        {HOUR_OPTIONS.map((hh) => (
          <option key={hh} value={hh}>
            {hh}
          </option>
        ))}
      </select>
      <span className="hours-time-colon" aria-hidden>
        :
      </span>
      <select
        className="form-select form-select-sm hours-time-select hours-time-select--min"
        value={m}
        aria-label={`${ariaLabel} — minutos`}
        onChange={(e) => onChange(joinHm(h, e.target.value))}
      >
        {MINUTE_OPTIONS.map((mm) => (
          <option key={mm} value={mm}>
            {mm}
          </option>
        ))}
      </select>
    </div>
  )
}

type Props = {
  value: HoursFormState
  onChange: (next: HoursFormState) => void
  variant?: 'default' | 'panel'
}

export function HoursEditor({ value, onChange, variant = 'default' }: Props) {
  const panel = variant === 'panel'

  function setMode(mode: HoursMode) {
    if (mode === value.mode) return
    const next: HoursFormState = { mode, days: { ...value.days } }
    for (const { key } of DAYS) {
      const d = next.days[key]
      if (!d || d.closed) continue
      if (mode === 'single') {
        next.days[key] = { ...d, periods: [d.periods[0] ?? defaultPeriod(0)] }
      } else {
        const first = d.periods[0] ?? defaultPeriod(0)
        const second = d.periods[1] ?? defaultPeriod(1)
        next.days[key] = { ...d, periods: [first, second] }
      }
    }
    onChange(next)
  }

  function toggleDayClosed(key: string) {
    const d = value.days[key]
    if (!d) return
    const closed = !d.closed
    onChange({
      ...value,
      days: {
        ...value.days,
        [key]: closed
          ? { closed: true, periods: d.periods.length ? d.periods : [defaultPeriod(0)] }
          : {
              closed: false,
              periods:
                value.mode === 'split'
                  ? [defaultPeriod(0), defaultPeriod(1)]
                  : [d.periods[0] ?? defaultPeriod(0)],
            },
      },
    })
  }

  function updatePeriod(key: string, index: number, patch: Partial<TimeSlot>) {
    const d = value.days[key]
    if (!d || d.closed) return
    const periods = d.periods.map((p, i) => (i === index ? { ...p, ...patch } : p))
    onChange({ ...value, days: { ...value.days, [key]: { ...d, periods } } })
  }

  function renderSingleOpenRow(key: string, label: string, slot: TimeSlot) {
    return (
      <>
        <button
          type="button"
          className="hours-day-toggle hours-day-toggle--on"
          role="switch"
          aria-checked
          onClick={() => toggleDayClosed(key)}
        />
        <span className="hours-day-row-label">{label}</span>
        <div className="hours-day-periods-wrap hours-day-periods-wrap--single-centered">
          <div className="hours-day-period-inline hours-day-period-inline--hm">
            <TimeHmSelects
              value={slot.open}
              onChange={(next) => updatePeriod(key, 0, { open: next })}
              ariaLabel={`Abertura em ${label}`}
            />
            <span className="hours-ate">às</span>
            <TimeHmSelects
              value={slot.close}
              onChange={(next) => updatePeriod(key, 0, { close: next })}
              ariaLabel={`Fechamento em ${label}`}
            />
          </div>
        </div>
      </>
    )
  }

  function renderSplitOpenGrid(key: string, label: string, lunch: TimeSlot, dinner: TimeSlot) {
    return (
      <div className="hours-day-row hours-day-row--split-grid">
        <button
          type="button"
          className="hours-day-toggle hours-day-grid-toggle hours-day-toggle--on"
          role="switch"
          aria-checked
          onClick={() => toggleDayClosed(key)}
        />
        <span className="hours-day-row-label hours-day-grid-label">{label}</span>
        <div className="hours-day-period-inline hours-day-period-inline--hm hours-day-grid-lunch">
          <TimeHmSelects
            value={lunch.open}
            onChange={(next) => updatePeriod(key, 0, { open: next })}
            ariaLabel={`Almoço — abertura em ${label}`}
          />
          <span className="hours-ate">às</span>
          <TimeHmSelects
            value={lunch.close}
            onChange={(next) => updatePeriod(key, 0, { close: next })}
            ariaLabel={`Almoço — fechamento em ${label}`}
          />
        </div>
        <span className="hours-day-grid-corner-spacer" aria-hidden />
        <span className="hours-day-grid-corner-spacer" aria-hidden />
        <div className="hours-day-period-inline hours-day-period-inline--hm hours-day-grid-dinner">
          <TimeHmSelects
            value={dinner.open}
            onChange={(next) => updatePeriod(key, 1, { open: next })}
            ariaLabel={`Jantar — abertura em ${label}`}
          />
          <span className="hours-ate">às</span>
          <TimeHmSelects
            value={dinner.close}
            onChange={(next) => updatePeriod(key, 1, { close: next })}
            ariaLabel={`Jantar — fechamento em ${label}`}
          />
        </div>
      </div>
    )
  }

  function renderDayBlock(key: string, label: string) {
    const d = value.days[key]
    if (!d) return null

    if (d.closed) {
      return (
        <div key={key} className="hours-day-row hours-day-row--closed">
          <button
            type="button"
            className="hours-day-toggle"
            role="switch"
            aria-checked={false}
            onClick={() => toggleDayClosed(key)}
          />
          <span className="hours-day-row-label">{label}</span>
          <span className="hours-day-closed-text">Fechado</span>
        </div>
      )
    }

    if (value.mode === 'split') {
      const lunch = d.periods[0] ?? defaultPeriod(0)
      const dinner = d.periods[1] ?? defaultPeriod(1)
      return <div key={key}>{renderSplitOpenGrid(key, label, lunch, dinner)}</div>
    }

    const slot = d.periods[0] ?? defaultPeriod(0)
    return (
      <div key={key} className="hours-day-row">
        {renderSingleOpenRow(key, label, slot)}
      </div>
    )
  }

  const inner = (
    <>
      <p className="hours-editor-ref-section-label">Modelo de funcionamento</p>
      <div className="hours-mode-row hours-mode-row--btn" role="group" aria-label="Modelo de funcionamento">
        <button
          type="button"
          className={`hours-mode-btn hours-mode-btn--single ${value.mode === 'single' ? 'hours-mode-btn--active' : ''}`}
          aria-pressed={value.mode === 'single'}
          onClick={() => setMode('single')}
        >
          Período único
        </button>
        <button
          type="button"
          className={`hours-mode-btn hours-mode-btn--split ${value.mode === 'split' ? 'hours-mode-btn--active' : ''}`}
          aria-pressed={value.mode === 'split'}
          onClick={() => setMode('split')}
        >
          Dois períodos
        </button>
      </div>

      <div className="hours-editor-ref-days vstack gap-1">{DAYS.map(({ key, label }) => renderDayBlock(key, label))}</div>
    </>
  )

  if (panel) {
    return (
      <div className="hours-editor-ref hours-editor-ref--panel hours-editor-ref--compact">
        <div className="hours-editor-ref-head">
          <span className="hours-editor-ref-icon" aria-hidden>
            <IconCalendar size={22} />
          </span>
          <div>
            <h3 className="hours-editor-ref-title">Horário de atendimento</h3>
            <p className="hours-editor-ref-sub mb-0">
              Defina os dias e períodos em que seu estabelecimento está aberto.
            </p>
          </div>
        </div>
        {inner}
      </div>
    )
  }

  return (
    <div className="hours-editor-ref">
      <div className="hours-editor-ref-head">
        <span className="hours-editor-ref-icon" aria-hidden>
          <IconCalendar size={22} />
        </span>
        <div>
          <h3 className="hours-editor-ref-title">Horário de atendimento</h3>
          <p className="hours-editor-ref-sub mb-0">
            Defina os dias e períodos em que seu estabelecimento está aberto.
          </p>
        </div>
      </div>
      {inner}
    </div>
  )
}
