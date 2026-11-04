import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { isVenueUser } from '../../api/types/auth'

export function AfterHeader() {
  const { user, logout } = useAuth()
  const venue = isVenueUser(user)

  return (
    <header className="border-bottom bg-white sticky-top">
      <nav className="navbar navbar-expand-lg navbar-light container-fluid px-3 px-lg-4">
        <Link className="navbar-brand d-flex align-items-center gap-2" to="/">
          <span className="after-brand-text fs-4 mb-0">After</span>
          <span className="text-muted small d-none d-sm-inline">
            O que tem pra hoje?
          </span>
        </Link>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#afterMainNav"
          aria-controls="afterMainNav"
          aria-expanded="false"
          aria-label="Menu"
        >
          <span className="navbar-toggler-icon" />
        </button>
        <div className="collapse navbar-collapse" id="afterMainNav">
          <ul className="navbar-nav ms-auto align-items-lg-center gap-lg-2">
            {user ? (
              <>
                <li className="nav-item">
                  <NavLink className="nav-link" to="/" end>
                    Início
                  </NavLink>
                </li>
                <li className="nav-item">
                  <span className="nav-link disabled py-lg-2">
                    <span className="badge rounded-pill text-bg-light border">
                      {venue ? 'Estabelecimento' : 'Usuário'}
                    </span>
                  </span>
                </li>
                <li className="nav-item">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm ms-lg-2"
                    onClick={logout}
                  >
                    Sair
                  </button>
                </li>
              </>
            ) : (
              <li className="nav-item">
                <NavLink className="nav-link" to="/login">
                  Entrar
                </NavLink>
              </li>
            )}
          </ul>
        </div>
      </nav>
    </header>
  )
}
