import { MULTI_VENUE_ENABLED } from '../../auth/ActiveVenueContext'

/** Reservado para seletor de estabelecimento quando MULTI_VENUE_ENABLED. */
export function MultiVenuePlaceholder() {
  if (!MULTI_VENUE_ENABLED) return null
  return (
    <p className="small text-muted mb-0">
      Multi-estabelecimento em preparação (flag desligada).
    </p>
  )
}
