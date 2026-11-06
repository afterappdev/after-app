import { presentVenueCategory } from '../../constants/venueCategories'
import type { HomePromotion } from '../../features/home/types'
import { formatStoredCalendarDate } from '../../utils/dates'
import { formatDistanceKm } from '../../utils/distance'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { IconCalendar, IconStore } from '../icons/AfterIcons'
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
  const dealTitle = promo.title?.trim() || 'Promoção do dia'
  const validUntil = formatStoredCalendarDate(promo.displayDate)

  return (
    <FeedCard
      tone="promotion"
      imageUrl={imageUrl || undefined}
      emptyIcon=""
      onClick={() => {
        const id = venue?.id
        if (id) onOpen(id)
      }}
    >
      <div className="d-flex align-items-start justify-content-between gap-2">
        <h3 className="home-venue-name">{venue?.name ?? 'Local'}</h3>
        {promo.featured ? (
          <span
            className="flex-shrink-0 px-2 py-0 rounded-pill text-white small fw-bold"
            style={{ background: 'linear-gradient(90deg, #6d28d9, #9333ea)' }}
          >
            VIP
          </span>
        ) : null}
      </div>
      <StatusRow isOpen={promo.isOpen} distanceLabel={distanceLabel} />
      {category ? (
        <p className="home-meta-line mt-1">
          <span className="home-meta-icon" aria-hidden>
            <IconStore size={14} />
          </span>
          {category}
        </p>
      ) : null}
      <p className="home-meta-line mt-1 mb-0" style={{ fontWeight: 600, color: 'var(--home-ink)' }}>
        {dealTitle}
      </p>
      {promo.description ? (
        <p className="home-meta-line mt-1 mb-0">{promo.description}</p>
      ) : null}
      {validUntil ? (
        <p className="home-meta-line mt-1 mb-0" style={{ color: 'var(--home-orange)', fontSize: 10 }}>
          <span className="home-meta-icon" aria-hidden>
            <IconCalendar size={12} />
          </span>
          Válido para o dia {validUntil}
        </p>
      ) : null}
    </FeedCard>
  )
}
