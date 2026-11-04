import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ProfileVenueSummary } from '../../features/profile/types'
import { resolveMediaUrl } from '../../utils/mediaUrl'

type Props = {
  venue: ProfileVenueSummary
  trailing?: ReactNode
}

export function ProfileVenueRow({ venue, trailing }: Props) {
  const imageUrl = resolveMediaUrl(venue.logoUrl ?? venue.coverUrl)
  return (
    <div className="d-flex align-items-center gap-3 p-3 bg-white rounded shadow-sm">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          width={52}
          height={52}
          className="rounded object-fit-cover flex-shrink-0"
        />
      ) : (
        <div
          className="rounded bg-light flex-shrink-0 d-flex align-items-center justify-content-center"
          style={{ width: 52, height: 52 }}
        >
          <span className="text-muted small">Local</span>
        </div>
      )}
      <div className="flex-grow-1 min-w-0">
        <Link
          to={`/venue/${encodeURIComponent(venue.id)}`}
          className="fw-semibold text-decoration-none text-dark text-truncate d-block"
        >
          {venue.name || 'Estabelecimento'}
        </Link>
        {venue.city ? (
          <p className="small text-muted mb-0 text-truncate">
            {venue.city}
            {venue.state ? `, ${venue.state}` : ''}
          </p>
        ) : null}
      </div>
      {trailing ? <div className="flex-shrink-0">{trailing}</div> : null}
    </div>
  )
}
