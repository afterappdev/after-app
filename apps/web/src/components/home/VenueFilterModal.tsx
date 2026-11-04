import { useEffect, useState } from 'react'
import { VENUE_CATEGORIES } from '../../constants/venueCategories'
import { VENUE_AMENITIES } from '../../constants/venueAmenities'
import {
  cloneVenueSearchFilters,
  type VenueSearchFilters,
} from '../../features/home/venueSearchFilters'

type Props = {
  show: boolean
  initial: VenueSearchFilters
  onClose: () => void
  onApply: (filters: VenueSearchFilters) => void
}

export function VenueFilterModal({ show, initial, onClose, onApply }: Props) {
  const [draft, setDraft] = useState(() => cloneVenueSearchFilters(initial))

  useEffect(() => {
    if (show) setDraft(cloneVenueSearchFilters(initial))
  }, [show, initial])

  if (!show) return null

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog">
        <div className="modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5 fw-bold">Filtrar locais</h2>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body vstack gap-3">
              <div>
                <label className="form-label fw-semibold">Categoria</label>
                <select
                  className="form-select"
                  value={draft.category ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      category: e.target.value || null,
                    }))
                  }
                >
                  <option value="">Todas</option>
                  {VENUE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="form-label fw-semibold mb-2">Avaliação mínima</p>
                <div className="d-flex flex-wrap gap-2">
                  {[0, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      className={`btn btn-sm ${draft.minRating === rating ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, minRating: rating }))
                      }
                    >
                      {rating === 0 ? 'Qualquer' : `${rating}+ estrelas`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-check">
                <input
                  id="cover-charge"
                  type="checkbox"
                  className="form-check-input"
                  checked={draft.hasCoverCharge}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      hasCoverCharge: e.target.checked,
                    }))
                  }
                />
                <label htmlFor="cover-charge" className="form-check-label">
                  Entrada paga
                </label>
              </div>
              <div>
                <p className="form-label fw-semibold mb-2">Comodidades</p>
                <div className="row g-2">
                  {VENUE_AMENITIES.map((item) => (
                    <div key={item.key} className="col-12 col-md-6">
                      <div className="form-check">
                        <input
                          id={`amenity-${item.key}`}
                          type="checkbox"
                          className="form-check-input"
                          checked={!!draft.amenities[item.key]}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              amenities: {
                                ...prev.amenities,
                                [item.key]: e.target.checked,
                              },
                            }))
                          }
                        />
                        <label
                          htmlFor={`amenity-${item.key}`}
                          className="form-check-label small"
                        >
                          {item.filterLabel ?? item.label}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setDraft(cloneVenueSearchFilters(initial))}
              >
                Limpar
              </button>
              <button type="button" className="btn btn-primary ms-auto" onClick={() => onApply(draft)}>
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
  )
}
