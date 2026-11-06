import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { AfterLoading } from '../../components/layout/AfterLoading'
import { loginReturnPath } from '../../utils/loginReturn'
import { userGuardPhase } from './guardRules'

export function RequireUser({ children }: { children: ReactNode }) {
  const { user, bootstrapping } = useAuth()
  const location = useLocation()
  const phase = userGuardPhase(bootstrapping, user)

  if (phase === 'loading') {
    return <AfterLoading />
  }

  if (phase === 'guest') {
    const from = loginReturnPath(location.pathname)
    return <Navigate to="/login" replace state={{ from }} />
  }

  if (phase === 'wrong_role') {
    return (
      <div className="after-canvas alert alert-info">
        Área disponível para contas de usuário. Estabelecimentos usam o painel do app mobile.
      </div>
    )
  }

  return children
}
