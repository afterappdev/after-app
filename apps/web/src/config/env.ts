const DEFAULT_DEV_API = 'http://127.0.0.1:3000'

export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim()
  if (raw) return raw.replace(/\/$/, '')
  return DEFAULT_DEV_API
}
