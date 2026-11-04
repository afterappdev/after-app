import { useAuth } from '../../auth/AuthContext'
import { useActiveVenue } from '../../auth/ActiveVenueContext'
import { isVenueUser } from '../../api/types/auth'

export function HomePage() {
  const { user } = useAuth()
  const activeVenue = useActiveVenue()
  const venue = isVenueUser(user)

  return (
    <div className="row g-4">
      <div className="col-12 col-lg-8">
        <div className="p-4 p-lg-5 bg-white rounded-3 shadow-sm border">
          <h1 className="h3 after-brand-text">
            Olá, {user?.name?.split(' ')[0] ?? 'visitante'}
          </h1>
          <p className="text-muted mb-4">
            Placeholder da home After Web. Próximos módulos: busca, feed e
            ficha pública.
          </p>
          <div className="d-flex flex-wrap gap-2">
            <span className="badge text-bg-warning">
              Papel: {venue ? 'VENUE' : 'USER'}
            </span>
            {user?.city ? (
              <span className="badge text-bg-light border">
                {user.city} / {user.state}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="col-12 col-lg-4">
        <div className="card border-0 shadow-sm h-100">
          <div className="card-body">
            <h2 className="h6 text-secondary">Estabelecimento ativo</h2>
            {activeVenue.enabled ? (
              <p className="small mb-0">Multi-estabelecimento ligado (futuro).</p>
            ) : (
              <>
                <p className="small text-muted">
                  Multi-estabelecimento <strong>desativado</strong> nesta base (
                  release <code>f8cccad</code>).
                </p>
                {venue && user?.venueId ? (
                  <code className="small">{user.venueId}</code>
                ) : (
                  <span className="small text-muted">—</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
