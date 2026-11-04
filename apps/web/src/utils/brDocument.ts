export function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function isValidCpf(value: string): boolean {
  const digits = digitsOnly(value)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i)
  let check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== Number(digits[9])) return false
  sum = 0
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i)
  check = (sum * 10) % 11
  if (check === 10) check = 0
  return check === Number(digits[10])
}

export function isValidCnpj(value: string): boolean {
  const digits = digitsOnly(value)
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * w1[i]
  let rem = sum % 11
  const d1 = rem < 2 ? 0 : 11 - rem
  if (d1 !== Number(digits[12])) return false
  sum = 0
  for (let i = 0; i < 13; i += 1) sum += Number(digits[i]) * w2[i]
  rem = sum % 11
  const d2 = rem < 2 ? 0 : 11 - rem
  return d2 === Number(digits[13])
}

export function formatCpf(digits: string): string {
  const d = digitsOnly(digits)
  if (d.length !== 11) return digits
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function formatCnpj(digits: string): string {
  const d = digitsOnly(digits)
  if (d.length !== 14) return digits
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
