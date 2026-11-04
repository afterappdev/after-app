export function formatDistanceKm(value: unknown): string | null {
  if (value == null) return null
  const km =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value))
  if (Number.isNaN(km) || km < 0) return null
  if (km < 0.1) return '~100 m'
  if (km < 1) return `~${Math.round(km * 1000)} m`
  const text = km < 10 ? km.toFixed(1) : String(Math.round(km))
  return `~${text.replace('.', ',')} km`
}
