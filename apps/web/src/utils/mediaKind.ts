import type { VenuePhoto } from '../features/venue/types'

export const videoExtensions = [
  '.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv', '.3gp', '.mpeg', '.mpg', '.ogv',
]

export function hasVideoExtension(path: string): boolean {
  const filename = path.split(/[?#]/, 1)[0].toLowerCase()
  return videoExtensions.some((extension) => filename.endsWith(extension))
}

export function isVideoMedia(item: VenuePhoto): boolean {
  const type = item.mediaType?.toUpperCase()
  if (type === 'VIDEO') return true
  if (type === 'IMAGE') return false
  return hasVideoExtension(item.url ?? '')
}

export function galleryPhotos(photos: VenuePhoto[]): VenuePhoto[] {
  return photos.filter((p) => p.kind !== 'MENU')
}

export function menuPhotos(photos: VenuePhoto[]): VenuePhoto[] {
  return photos.filter((p) => p.kind === 'MENU')
}
