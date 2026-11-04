import { getApiBaseUrl } from '../config/env'

/** Paridade com Flutter ApiConfig.resolveMediaUrl. */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url?.trim()) return ''
  const value = url.trim()
  if (value.startsWith('/')) {
    return `${getApiBaseUrl()}${value}`
  }
  try {
    const origin = new URL(getApiBaseUrl())
    return value
      .replace('http://127.0.0.1:3000', origin.origin)
      .replace('http://localhost:3000', origin.origin)
      .replace('http://10.0.2.2:3000', origin.origin)
  } catch {
    return value
  }
}
