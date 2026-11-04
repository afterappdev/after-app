export function formatVenueEntry(contacts: Record<string, unknown> | null | undefined): string {
  if (!contacts) return 'Entrada gratuita'
  const hasCoverCharge = contacts.hasCoverCharge === true
  if (!hasCoverCharge) return 'Entrada gratuita'
  const raw = String(contacts.coverCharge ?? '').trim()
  if (!raw) return 'Entrada paga'
  return raw.toLowerCase().startsWith('r$') ? raw : `R$ ${raw}`
}
