import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ProfileVenueSummary } from '../../features/profile/types'
import { IconStore } from '../icons/AfterIcons'
import { resolveMediaUrl } from '../../utils/mediaUrl'

type Props = {
  venue: ProfileVenueSummary
  trailing?: ReactNode
}

export function ProfileVenueRow({ venue, trailing }: Props) {
  const imageUrl = resolveMediaUrl(venue.logoUrl ?? venue.coverUrl)
  return (
    <div className="after-row-card">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          width={52}
          height={52}
          className="rounded-circle object-fit-cover flex-shrink-0"
        />
      ) : (
        <span
          className="rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center"
          style={{ width: 52, height: 52, background: '#e8f0ed', color: '#f58634' }}
        >
          <IconStore size={22} />
        </span>
      )}
      <div className="flex-grow-1 min-w-0">
        <Link
          to={`/venue/${encodeURIComponent(venue.id)}`}
          className="text-truncate d-block text-decoration-none"
        >
          {venue.name || 'Estabelecimento'}
        </Link>
        {venue.city ? (
          <p className="small mb-0 text-truncate" style={{ color: '#8a9391' }}>
            {venue.city}
            {venue.state ? `, ${venue.state}` : ''}
          </p>
        ) : null}
      </div>
      {trailing ? <div className="flex-shrink-0">{trailing}</div> : null}
    </div>
  )
}
