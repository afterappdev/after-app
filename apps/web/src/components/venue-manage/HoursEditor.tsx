import { DAYS } from '../../utils/hours'
import type { HoursFormState } from '../../utils/venueHours'

type Props = {
  value: HoursFormState
  onChange: (next: HoursFormState) => void
}

export function HoursEditor({ value, onChange }: Props) {
  return (
    <div className="vstack gap-2">
      {DAYS.map(({ key, label }) => {
        const row = value[key]
        if (!row) return null
        return (
          <div key={key} className="row g-2 align-items-center">
            <div className="col-12 col-md-3 small fw-semibold">{label}</div>
            <div className="col-12 col-md-9">
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`closed-${key}`}
                    checked={row.closed}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [key]: { ...row, closed: e.target.checked },
                      })
                    }
                  />
                  <label className="form-check-label small" htmlFor={`closed-${key}`}>
                    Fechado
                  </label>
                </div>
                {!row.closed ? (
                  <>
                    <input
                      type="time"
                      className="form-control form-control-sm"
                      style={{ width: 120 }}
                      value={row.open}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          [key]: { ...row, open: e.target.value },
                        })
                      }
                    />
                    <span className="small text-muted">até</span>
                    <input
                      type="time"
                      className="form-control form-control-sm"
                      style={{ width: 120 }}
                      value={row.close}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          [key]: { ...row, close: e.target.value },
                        })
                      }
                    />
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
