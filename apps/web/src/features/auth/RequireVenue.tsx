import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useOwnedVenueId } from '../venue-manage/useOwnedVenueId'

export function RequireVenue({ children }: { children: ReactNode }) {
  const { user, bootstrapping } = useAuth()
  const venueId = useOwnedVenueId()

  if (bootstrapping) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-warning" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="alert alert-warning">
        Entre com a conta do estabelecimento.{' '}
        <Link to="/login" state={{ from: 'estabelecimento' }}>
          Ir para login
        </Link>
      </div>
    )
  }

  if (user.role !== 'VENUE' || !venueId) {
    return (
      <div className="alert alert-info">
        Painel disponível para contas de estabelecimento vinculadas a um local.
      </div>
    )
  }

  return children
}
