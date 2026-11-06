import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { isVenueUser } from '../../api/types/auth'
import { useAuth } from '../../auth/AuthContext'
import { IconHeart, IconHome, IconPerson, IconSearch, IconStar, IconStore } from '../icons/AfterIcons'
import { AfterLogo } from './AfterLogo'
import { BUY_CREDITS_PATH, isPublicationCreditsRoute, thirdSlot } from './navTargets'

export function AfterSideNav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [open, setOpen] = useState(false)
  const venue = isVenueUser(user)
  const onHome = location.pathname === '/'
  const searching = onHome && params.get('busca') === '1'
  const third = thirdSlot(user)
  const ThirdIcon = third.label === 'Publicar' ? IconStore : IconHeart
  const thirdPathBase = third.to.split('#')[0] ?? third.to
  const thirdLinkActive =
    third.label === 'Publicar'
      ? isPublicationCreditsRoute(location.pathname)
      : location.pathname === thirdPathBase

  return (
    <aside className={`after-side ${open ? 'is-open' : ''}`}>
      <div className="after-side-head">
        <Link to="/" aria-label="After" onClick={() => setOpen(false)}>
          <AfterLogo height={56} className="after-side-logo" />
        </Link>
        <button
          type="button"
          className="after-side-toggle"
          aria-expanded={open}
          aria-label={open ? 'Recolher menu' : 'Abrir menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '×' : '☰'}
        </button>
      </div>
      <nav className="after-side-nav" aria-label="Principal">
        <Link to="/" className={onHome && !searching ? 'active' : undefined} onClick={() => setOpen(false)}>
          <IconHome />
          <span>Home</span>
        </Link>
        <Link to="/?busca=1" className={searching ? 'active' : undefined} onClick={() => setOpen(false)}>
          <IconSearch />
          <span>Pesquisar locais</span>
        </Link>
        <Link
          to={third.to}
          state={third.state}
          className={thirdLinkActive ? 'active' : undefined}
          onClick={() => setOpen(false)}
        >
          <ThirdIcon />
          <span>{third.label}</span>
        </Link>
        <NavLink to={user ? '/perfil' : '/login'} end onClick={() => setOpen(false)}>
          <IconPerson />
          <span>Perfil</span>
        </NavLink>
        {venue ? (
          <NavLink to={BUY_CREDITS_PATH} end onClick={() => setOpen(false)}>
            <IconStar />
            <span>Comprar créditos</span>
          </NavLink>
        ) : null}
        {user && !venue ? (
          <>
            <NavLink to="/perfil/notificacoes" onClick={() => setOpen(false)}>
              <IconPerson />
              <span>Notificações</span>
            </NavLink>
            <NavLink to="/perfil/conta" onClick={() => setOpen(false)}>
              <IconPerson />
              <span>Conta</span>
            </NavLink>
          </>
        ) : null}
        {!user ? (
          <NavLink to="/login" onClick={() => setOpen(false)}>
            <IconPerson />
            <span>Entrar</span>
          </NavLink>
        ) : null}
      </nav>
      {user ? (
        <div className="after-side-foot">
          <button
            type="button"
            className="after-side-logout"
            onClick={() => {
              logout()
              navigate('/')
              setOpen(false)
            }}
          >
            Logout
          </button>
        </div>
      ) : null}
    </aside>
  )
}
