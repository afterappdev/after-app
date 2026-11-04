import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'

/** Multi-estabelecimento: desligado até API/consolidado homologado. */
export const MULTI_VENUE_ENABLED = false

type ActiveVenueContextValue = {
  enabled: boolean
  activeVenueId: string | null
  setActiveVenueId: (venueId: string) => void
}

const ActiveVenueContext = createContext<ActiveVenueContextValue | null>(null)

export function ActiveVenueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const value = useMemo<ActiveVenueContextValue>(() => {
    const fallbackVenueId = user?.venueId ?? null
    return {
      enabled: MULTI_VENUE_ENABLED,
      activeVenueId: fallbackVenueId,
      setActiveVenueId: () => {
        if (!MULTI_VENUE_ENABLED) return
      },
    }
  }, [user?.venueId])

  return (
    <ActiveVenueContext.Provider value={value}>
      {children}
    </ActiveVenueContext.Provider>
  )
}

export function useActiveVenue() {
  const ctx = useContext(ActiveVenueContext)
  if (!ctx) {
    throw new Error('useActiveVenue must be used within ActiveVenueProvider')
  }
  return ctx
}

/** Header opcional para rotas de estabelecimento (futuro). */
export function activeVenueHeaders(
  ctx: ActiveVenueContextValue,
): Record<string, string> {
  if (!ctx.enabled || !ctx.activeVenueId) return {}
  return { 'x-after-active-venue-id': ctx.activeVenueId }
}
