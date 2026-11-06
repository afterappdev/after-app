import { IconPin } from '../icons/AfterIcons'
import type { CityOption } from '../../features/home/types'

type Props = {
  city: string
  state: string
  caption: string | null
  expanded: boolean
  query: string
  loading: boolean
  results: CityOption[]
  onToggle: () => void
  onQueryChange: (value: string) => void
  onSelect: (city: CityOption) => void
}

export function CityPicker({
  city,
  state,
  caption,
  expanded,
  query,
  loading,
  results,
  onToggle,
  onQueryChange,
  onSelect,
}: Props) {
  const label = state.trim() ? `${city}, ${state}` : city || 'Sua cidade'

  return (
    <div className="home-location-card">
      <div className="home-location-trigger">
        <span className="home-location-pin" aria-hidden>
          <IconPin />
        </span>
        <div className="flex-grow-1 min-w-0">
          {expanded ? (
            <input
              type="search"
              className="form-control border-0 shadow-none p-0 fw-semibold"
              placeholder="Buscar cidade"
              value={query}
              autoFocus
              onChange={(e) => onQueryChange(e.target.value)}
              style={{ fontSize: 14, color: 'var(--home-ink)' }}
            />
          ) : (
            <button
              type="button"
              className="btn btn-link text-decoration-none text-start w-100 p-0 border-0"
              onClick={onToggle}
            >
              <div className="home-location-city">{label}</div>
              {caption ? <div className="home-location-caption">{caption}</div> : null}
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn-link p-0 text-secondary"
          onClick={onToggle}
          aria-label={expanded ? 'Fechar busca de cidade' : 'Alterar cidade'}
        >
          {expanded ? '✕' : '▾'}
        </button>
      </div>
      {expanded ? (
        <div className="px-3 pb-3">
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {loading ? (
              <div className="text-center py-3">
                <div
                  className="spinner-border spinner-border-sm"
                  style={{ color: 'var(--home-orange)' }}
                />
              </div>
            ) : results.length === 0 ? (
              <p className="small mb-0 py-2" style={{ color: 'var(--home-muted)' }}>
                Digite para buscar.
              </p>
            ) : (
              <ul className="list-unstyled mb-0">
                {results.map((item) => (
                  <li key={`${item.name}-${item.uf}`} className="border-top py-2">
                    <button
                      type="button"
                      className="btn btn-link text-start w-100 p-0 text-decoration-none"
                      style={{ color: 'var(--home-ink)', fontWeight: 600 }}
                      onClick={() => onSelect(item)}
                    >
                      {item.name}
                      {item.uf ? `, ${item.uf}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
