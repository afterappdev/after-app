import type { VenuePhoto } from '../features/venue/types'

export function isVideoMedia(item: VenuePhoto): boolean {
  const type = item.mediaType?.toUpperCase()
  if (type === 'VIDEO') return true
  if (type === 'IMAGE') return false
  const path = item.url?.toLowerCase() ?? ''
  return (
    path.endsWith('.mp4') ||
    path.endsWith('.webm') ||
    path.endsWith('.mov') ||
    path.endsWith('.m4v') ||
    path.endsWith('.ogv')
  )
}

export function galleryPhotos(photos: VenuePhoto[]): VenuePhoto[] {
  return photos.filter((p) => p.kind !== 'MENU')
}

export function menuPhotos(photos: VenuePhoto[]): VenuePhoto[] {
  return photos.filter((p) => p.kind === 'MENU')
}
