import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { listBlockedVenues, unblockVenue } from '../../api/blockedVenues'
import { AsyncPanel } from '../../components/common/AsyncPanel'
import { ProfileVenueRow } from '../../components/profile/ProfileVenueRow'
import { useAuth } from '../../auth/AuthContext'
import type { BlockedVenueItem } from './types'

export function BlockedVenuesPage() {
  const { api } = useAuth()
  const [items, setItems] = useState<BlockedVenueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listBlockedVenues(api))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar bloqueados.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  async function onUnblock(venueId: string) {
    if (
      !window.confirm(
        'Desbloquear este estabelecimento? Você voltará a ver este local no After.',
      )
    ) {
      return
    }
    if (busy.has(venueId)) return
    setBusy((prev) => new Set(prev).add(venueId))
    try {
      await unblockVenue(api, venueId)
      setItems((prev) => prev.filter((item) => item.venueId !== venueId))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível desbloquear.')
    } finally {
      setBusy((prev) => {
        const next = new Set(prev)
        next.delete(venueId)
        return next
      })
    }
  }

  return (
    <div className="mx-auto vstack gap-3" style={{ maxWidth: 520 }}>
      <div className="d-flex align-items-center gap-2">
        <Link to="/perfil" className="btn btn-sm btn-outline-secondary">
          ← Perfil
        </Link>
        <h1 className="h5 mb-0">Bloqueados</h1>
      </div>
      <AsyncPanel
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={!loading && !error && items.length === 0}
        emptyMessage="Nenhum estabelecimento bloqueado."
      >
        <div className="vstack gap-2">
          {items.map((item) =>
            item.venue ? (
              <ProfileVenueRow
                key={item.venueId}
                venue={item.venue}
                trailing={
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={busy.has(item.venueId)}
                    onClick={() => void onUnblock(item.venueId)}
                  >
                    Desbloquear
                  </button>
                }
              />
            ) : null,
          )}
        </div>
      </AsyncPanel>
    </div>
  )
}
