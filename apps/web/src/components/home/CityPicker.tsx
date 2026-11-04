import type { CityOption } from '../../features/home/types'

type Props = {
  city: string
  state: string
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
  expanded,
  query,
  loading,
  results,
  onToggle,
  onQueryChange,
  onSelect,
}: Props) {
  const label = state ? `${city}, ${state}` : city || 'Escolher cidade'

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-3">
        {!expanded ? (
          <button
            type="button"
            className="btn btn-link text-decoration-none text-start w-100 p-0"
            onClick={onToggle}
          >
            <span className="me-2" style={{ color: 'var(--after-brand)' }}>
              📍
            </span>
            <span className="fw-semibold text-body">{label}</span>
          </button>
        ) : (
          <>
            <input
              type="search"
              className="form-control"
              placeholder="Buscar cidade"
              value={query}
              autoFocus
              onChange={(e) => onQueryChange(e.target.value)}
            />
            <div className="mt-2" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {loading ? (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-warning" />
                </div>
              ) : results.length === 0 ? (
                <p className="small text-muted mb-0 py-2">Digite para buscar.</p>
              ) : (
                <ul className="list-group list-group-flush">
                  {results.map((item) => (
                    <li key={`${item.name}-${item.uf}`} className="list-group-item px-0">
                      <button
                        type="button"
                        className="btn btn-link text-start w-100 p-0 text-decoration-none"
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
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mt-2"
              onClick={onToggle}
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
