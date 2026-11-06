import { presentVenueCategory } from '../../constants/venueCategories'
import type { VenueSummary } from '../../features/home/types'
import { formatDistanceKm } from '../../utils/distance'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { IconPin, IconStore } from '../icons/AfterIcons'
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
  const cityLabel = venue.city
    ? `${venue.city}${venue.state ? `, ${venue.state}` : ''}`
    : ''

  return (
    <FeedCard
      tone="venue"
      imageUrl={imageUrl || undefined}
      onClick={() => venue.id && onOpen(venue.id)}
    >
      <h3 className="home-venue-name">{venue.name || 'Local'}</h3>
      <StatusRow
        isOpen={venue.isOpen}
        hasOpenInfo={venue.isOpen != null}
        distanceLabel={distanceLabel}
      />
      {category ? (
        <p className="home-meta-line mt-1">
          <span className="home-meta-icon" aria-hidden>
            <IconStore size={14} />
          </span>
          {category}
        </p>
      ) : null}
      {cityLabel ? (
        <p className="home-meta-line mt-1">
          <span className="home-meta-icon home-meta-icon--purple" aria-hidden>
            <IconPin size={14} />
          </span>
          {cityLabel}
        </p>
      ) : null}
      {venue.description ? (
        <p className="home-meta-line mt-1 mb-0" style={{ WebkitLineClamp: 2, display: '-webkit-box' }}>
          {venue.description}
        </p>
      ) : null}
    </FeedCard>
  )
}
