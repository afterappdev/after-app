import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { fetchUnreadNotificationCount } from '../../api/notifications'
import { useAuth } from '../../auth/AuthContext'
import { isVenueUser } from '../../api/types/auth'
import { AfterLogo } from './AfterLogo'

export function AfterHeader() {
  const { user, logout, api } = useAuth()
  const venue = isVenueUser(user)
  const isUser = user?.role === 'USER'
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!isUser) {
      setUnread(0)
      return
    }
    let cancelled = false
    void fetchUnreadNotificationCount(api)
      .then((count) => {
        if (!cancelled) setUnread(count)
      })
      .catch(() => {
        if (!cancelled) setUnread(0)
      })
    return () => {
      cancelled = true
    }
  }, [api, isUser, user?.id])

  return (
    <header className="border-bottom bg-white sticky-top">
      <nav className="navbar navbar-expand-lg navbar-light container-fluid px-3 px-lg-4">
        <Link className="navbar-brand d-flex align-items-center gap-2" to="/">
          <AfterLogo height={48} className="d-inline-block after-header-logo" />
          <span className="text-muted small d-none d-sm-inline">O que tem pra hoje?</span>
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
            <li className="nav-item">
              <NavLink className="nav-link" to="/" end>
                Início
              </NavLink>
            </li>
            {isUser ? (
              <li className="nav-item">
                <NavLink className="nav-link position-relative" to="/perfil">
                  Perfil
                  {unread > 0 ? (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-danger">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ) : null}
            {venue ? (
              <>
                <li className="nav-item">
                  <NavLink className="nav-link" to="/estabelecimento">
                    Painel
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink className="nav-link" to="/estabelecimento/creditos">
                    Créditos
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink className="nav-link" to="/perfil/conta">
                    Conta
                  </NavLink>
                </li>
              </>
            ) : null}
            {user ? (
              <>
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
