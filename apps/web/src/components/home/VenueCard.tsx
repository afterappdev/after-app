import { presentVenueCategory } from '../../constants/venueCategories'
import type { VenueSummary } from '../../features/home/types'
import { formatDistanceKm } from '../../utils/distance'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { FeedCard } from './FeedCard'
import { StatusRow } from './StatusRow'

type Props = {
  venue: VenueSummary
  onOpen: (venueId: string) => void
}

export function VenueCard({ venue, onOpen }: Props) {
  const imageUrl = resolveMediaUrl(venue.logoUrl ?? venue.coverUrl)
  const category = presentVenueCategory(venue.category)
  const distanceLabel = formatDistanceKm(venue.distanceKm)

  return (
    <FeedCard
      imageUrl={imageUrl || undefined}
      borderAccent="var(--after-purple)"
      onClick={() => venue.id && onOpen(venue.id)}
    >
      <h3 className="h6 fw-bold mb-1">{venue.name || 'Local'}</h3>
      <StatusRow
        isOpen={venue.isOpen}
        distanceLabel={distanceLabel}
        distanceClassName="text-secondary"
      />
      {category ? <p className="small text-muted mb-1">{category}</p> : null}
      {venue.city ? (
        <p className="small text-muted mb-1">
          <span className="text-secondary">📍</span> {venue.city}
          {venue.state ? `, ${venue.state}` : ''}
        </p>
      ) : null}
      {venue.description ? (
        <p className="small text-muted mb-0 text-truncate-2">{venue.description}</p>
      ) : null}
    </FeedCard>
  )
}
