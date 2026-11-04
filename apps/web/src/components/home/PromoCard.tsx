import { presentVenueCategory } from '../../constants/venueCategories'
import type { HomePromotion } from '../../features/home/types'
import { formatStoredCalendarDate } from '../../utils/dates'
import { formatDistanceKm } from '../../utils/distance'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { FeedCard } from './FeedCard'
import { StatusRow } from './StatusRow'

type Props = {
  promo: HomePromotion
  onOpen: (venueId: string) => void
}

export function PromoCard({ promo, onOpen }: Props) {
  const venue = promo.venue
  const imageUrl = resolveMediaUrl(
    promo.imageUrl ?? venue?.coverUrl ?? venue?.logoUrl,
  )
  const category = presentVenueCategory(venue?.category)
  const distanceLabel = formatDistanceKm(promo.distanceKm)
  const dealTitle =
    promo.title?.trim() ||
    'Promoção do dia'
  const validUntil = formatStoredCalendarDate(promo.displayDate)

  return (
    <FeedCard
      imageUrl={imageUrl || undefined}
      emptyIcon="🏷️"
      borderAccent="var(--after-brand)"
      onClick={() => {
        const id = venue?.id
        if (id) onOpen(id)
      }}
    >
      <div className="d-flex align-items-start justify-content-between gap-2">
        <h3 className="h6 fw-bold mb-1">{venue?.name ?? 'Local'}</h3>
        {promo.featured ? (
          <span className="badge text-bg-warning text-dark">VIP</span>
        ) : null}
      </div>
      <StatusRow isOpen={promo.isOpen} distanceLabel={distanceLabel} />
      {category ? <p className="small text-muted mb-1">{category}</p> : null}
      <p className="small fw-semibold mb-1">{dealTitle}</p>
      {promo.description ? (
        <p className="small text-muted mb-1">{promo.description}</p>
      ) : null}
      {validUntil ? (
        <p className="small mb-0" style={{ color: 'var(--after-brand)' }}>
          Válido para o dia {validUntil}
        </p>
      ) : null}
    </FeedCard>
  )
}
