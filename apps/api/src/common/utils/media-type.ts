import { MediaType } from '@prisma/client';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;

export function inferMediaType(
  url: string,
  explicit?: MediaType | string | null,
): MediaType {
  if (explicit === MediaType.VIDEO || explicit === 'VIDEO') {
    return MediaType.VIDEO;
  }
  if (explicit === MediaType.IMAGE || explicit === 'IMAGE') {
    return MediaType.IMAGE;
  }
  try {
    const path = new URL(url, 'http://local.invalid').pathname;
    if (VIDEO_EXT.test(path)) {
      return MediaType.VIDEO;
    }
  } catch {
    if (VIDEO_EXT.test(url)) {
      return MediaType.VIDEO;
    }
  }
  return MediaType.IMAGE;
}
