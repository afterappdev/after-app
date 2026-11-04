import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { listFavorites, removeFavorite } from '../../api/favorites'
import { AsyncPanel } from '../../components/common/AsyncPanel'
import { ProfileVenueRow } from '../../components/profile/ProfileVenueRow'
import { useAuth } from '../../auth/AuthContext'
import type { FavoriteItem } from './types'

export function FavoritesPage() {
  const { api } = useAuth()
  const [items, setItems] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listFavorites(api))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar favoritos.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  async function unfavorite(venueId: string) {
    if (removing.has(venueId)) return
    const index = items.findIndex((item) => item.venueId === venueId)
    if (index < 0) return
    const backup = items[index]
    setItems((prev) => prev.filter((item) => item.venueId !== venueId))
    setRemoving((prev) => new Set(prev).add(venueId))
    try {
      await removeFavorite(api, venueId)
    } catch (err) {
      setItems((prev) => {
        const next = [...prev]
        next.splice(Math.min(index, next.length), 0, backup)
        return next
      })
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover.')
    } finally {
      setRemoving((prev) => {
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
        <h1 className="h5 mb-0">Favoritos</h1>
      </div>
      <AsyncPanel
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={!loading && !error && items.length === 0}
        emptyMessage="Nenhum favorito ainda."
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
                    className="btn btn-sm btn-outline-danger"
                    disabled={removing.has(item.venueId)}
                    onClick={() => void unfavorite(item.venueId)}
                  >
                    Remover
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
