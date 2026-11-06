import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { AfterLoading } from '../../components/layout/AfterLoading'
import { useOwnedVenueId } from '../venue-manage/useOwnedVenueId'
import { venueGuardPhase } from './guardRules'

export function RequireVenue({ children }: { children: ReactNode }) {
  const { user, bootstrapping } = useAuth()
  const venueId = useOwnedVenueId()
  const phase = venueGuardPhase(bootstrapping, user, venueId)

  if (phase === 'loading') {
    return <AfterLoading />
  }

  if (phase === 'guest') {
    return (
      <div className="after-canvas alert alert-warning">
        Entre com a conta do estabelecimento.{' '}
        <Link to="/login" state={{ from: 'estabelecimento' }}>
          Ir para login
        </Link>
      </div>
    )
  }

  if (phase === 'wrong_role') {
    return (
      <div className="after-canvas alert alert-info">
        Painel disponível para contas de estabelecimento vinculadas a um local.
      </div>
    )
  }

  return children
}
