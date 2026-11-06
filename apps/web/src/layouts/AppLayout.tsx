import { Outlet, useLocation } from 'react-router-dom'
import { AfterBottomNav } from '../components/layout/AfterBottomNav'
import { AfterSideNav } from '../components/layout/AfterSideNav'

const AUTH_PATHS = new Set([
  '/login',
  '/register',
  '/esqueci-minha-senha',
  '/redefinir-senha',
  '/confirmar-exclusao',
  '/oauth',
  '/auth/apple/callback',
])

export function AppLayout() {
  const location = useLocation()
  const isAuth = AUTH_PATHS.has(location.pathname)

  if (isAuth) {
    return (
      <div className="after-shell min-vh-100">
        <main className="after-auth">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="after-shell after-frame">
      <AfterSideNav />
      <main className="after-stage">
        <Outlet />
      </main>
      <AfterBottomNav />
    </div>
  )
}
