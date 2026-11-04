export function e164Digits(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function telUrl(raw: string): string {
  const digits = e164Digits(raw)
  return digits ? `tel:+${digits}` : '#'
}

export function whatsappUrl(raw: string): string {
  const digits = e164Digits(raw)
  return digits ? `https://wa.me/${digits}` : '#'
}

export function instagramHandle(raw: string): string {
  let handle = raw.trim()
  if (handle.includes('instagram.com/')) {
    handle = handle.split('instagram.com/').pop()?.split(/[/?#]/)[0] ?? handle
  }
  if (!handle.startsWith('@')) handle = `@${handle.replace(/^@/, '')}`
  return handle
}

export function instagramUrl(raw: string): string {
  const handle = instagramHandle(raw).replace(/^@/, '')
  return handle ? `https://instagram.com/${handle}` : '#'
}

export function formatPhoneDisplay(raw: string): string {
  const digits = e164Digits(raw)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return raw.trim()
}

export function googleMapsSearchUrl(
  lat: number | null | undefined,
  lng: number | null | undefined,
  city: string,
  state: string,
): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  }
  const q = encodeURIComponent(`${city} ${state} Brasil`.trim())
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}
