import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { AfterLoading } from '../../components/layout/AfterLoading'
import { loginReturnPath } from '../../utils/loginReturn'
import { sessionGuardPhase } from './guardRules'

/** Qualquer JWT válido (USER ou VENUE). */
export function RequireSession({ children }: { children: ReactNode }) {
  const { user, bootstrapping } = useAuth()
  const location = useLocation()
  const phase = sessionGuardPhase(bootstrapping, user)

  if (phase === 'loading') {
    return <AfterLoading />
  }

  if (phase === 'guest') {
    const from = loginReturnPath(location.pathname)
    return <Navigate to="/login" replace state={{ from }} />
  }

  return children
}
