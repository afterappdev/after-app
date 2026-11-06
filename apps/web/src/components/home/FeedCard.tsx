import type { ReactNode } from 'react'
import { IconFire, IconStore } from '../icons/AfterIcons'

export type HomeFeedTone = 'promotion' | 'venue'

type Props = {
  tone: HomeFeedTone
  imageUrl?: string
  emptyIcon?: string
  onClick?: () => void
  children: ReactNode
}

export function FeedCard({
  tone,
  imageUrl,
  emptyIcon = '',
  onClick,
  children,
}: Props) {
  return (
    <button
      type="button"
      className={`home-feed-card home-feed-card--${tone}`}
      onClick={onClick}
    >
      <span className={`home-feed-accent home-feed-accent--${tone}`} aria-hidden />
      <span className="home-feed-body">
        <span className="home-feed-image-wrap">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" />
          ) : (
            <span
              className={`home-feed-image-empty ${tone === 'venue' ? 'home-feed-image-empty--venue' : ''}`}
              aria-hidden
            >
              {emptyIcon || (tone === 'venue' ? <IconStore /> : <IconFire />)}
            </span>
          )}
        </span>
        <span className="home-feed-content">{children}</span>
      </span>
    </button>
  )
}
