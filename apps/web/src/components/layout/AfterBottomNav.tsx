import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { IconHeart, IconHome, IconPerson, IconSearch, IconStore } from '../icons/AfterIcons'
import { isPublicationCreditsRoute, thirdSlot } from './navTargets'

export function AfterBottomNav() {
  const { user } = useAuth()
  const location = useLocation()
  const [params] = useSearchParams()
  const onHome = location.pathname === '/'
  const searching = onHome && params.get('busca') === '1'
  const third = thirdSlot(user)
  const ThirdIcon = third.label === 'Publicar' ? IconStore : IconHeart
  const thirdPathBase = third.to.split('#')[0] ?? third.to
  const thirdLinkActive =
    third.label === 'Publicar'
      ? isPublicationCreditsRoute(location.pathname)
      : location.pathname === thirdPathBase

  return createPortal(
    <nav className="after-bottom-nav" aria-label="Principal">
      <Link to="/" className={onHome && !searching ? 'active' : undefined}>
        <IconHome />
        Home
      </Link>
      <Link to="/?busca=1" className={searching ? 'active' : undefined}>
        <IconSearch />
        Pesquisar locais
      </Link>
      <Link
        to={third.to}
        state={third.state}
        className={thirdLinkActive ? 'active' : undefined}
      >
        <ThirdIcon />
        {third.label}
      </Link>
      <NavLink
        to={user ? '/perfil' : '/login'}
        end
        className={({ isActive }) => (isActive && user ? 'active' : undefined)}
      >
        <IconPerson />
        Perfil
      </NavLink>
    </nav>,
    document.body,
  )
}
