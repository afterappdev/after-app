/** Formata dígitos para exibição (xx) xxxx-xxxx ou (xx) xxxxx-xxxx (até 11 dígitos nacionais). */
export function formatBrazilPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  const dd = d.slice(0, 2)
  const rest = d.slice(2)
  if (d.length <= 2) {
    return d.length < 2 ? `(${d}` : `(${dd})`
  }
  if (rest.length <= 8) {
    const first = rest.slice(0, 4)
    const second = rest.slice(4)
    return second ? `(${dd}) ${first}-${second}` : `(${dd}) ${first}`
  }
  const first = rest.slice(0, 5)
  const second = rest.slice(5, 9)
  return second ? `(${dd}) ${first}-${second}` : `(${dd}) ${first}`
}
