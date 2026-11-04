import type { ReactNode } from 'react'

type Props = {
  imageUrl?: string
  emptyIcon?: string
  onClick?: () => void
  borderAccent?: string
  children: ReactNode
}

export function FeedCard({
  imageUrl,
  emptyIcon = '🏪',
  onClick,
  borderAccent = 'var(--after-brand)',
  children,
}: Props) {
  return (
    <article
      className="card border-0 shadow-sm overflow-hidden h-100"
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      tabIndex={onClick ? 0 : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <div className="row g-0">
        <div className="col-4 col-sm-3">
          <div
            className="ratio ratio-1x1 bg-light d-flex align-items-center justify-content-center"
            style={{ borderLeft: `4px solid ${borderAccent}` }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="object-fit-cover w-100 h-100"
                loading="lazy"
              />
            ) : (
              <span className="fs-3" aria-hidden>
                {emptyIcon}
              </span>
            )}
          </div>
        </div>
        <div className="col-8 col-sm-9">
          <div className="card-body py-3 pe-3">{children}</div>
        </div>
      </div>
    </article>
  )
}
