export function newPublicationIdempotencyKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  encoded = encoded.replace(/[^A-Za-z0-9_-]/g, 'x')
  return encoded.length >= 16 ? encoded.slice(0, 24) : encoded.padEnd(16, 'x')
}
