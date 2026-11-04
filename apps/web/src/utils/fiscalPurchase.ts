import { digitsOnly, formatCnpj, formatCpf, isValidCnpj, isValidCpf } from './brDocument'
import type { FiscalPurchasePayload } from '../features/venue-credits/types'

export type FiscalFormState = {
  invoiceRequested: boolean
  personType: 'CPF' | 'CNPJ'
  name: string
  documentMasked: string
  email: string
  emailTouched: boolean
}

export function createFiscalFormState(accountEmail?: string | null): FiscalFormState {
  const email = accountEmail?.trim() ?? ''
  return {
    invoiceRequested: false,
    personType: 'CPF',
    name: '',
    documentMasked: '',
    email,
    emailTouched: false,
  }
}

export function rememberVenueFiscalDocument(
  state: FiscalFormState,
  input: { documentType?: string | null; documentDigits?: string | null; legalName?: string | null },
): FiscalFormState {
  const type = input.documentType === 'CNPJ' ? 'CNPJ' : input.documentType === 'CPF' ? 'CPF' : null
  const digits = digitsOnly(input.documentDigits)
  if (!type || !digits) return state
  const next = { ...state }
  if (!digitsOnly(state.documentMasked)) {
    next.personType = type
    next.documentMasked = type === 'CNPJ' ? formatCnpj(digits) : formatCpf(digits)
  }
  if (!next.name.trim() && (input.legalName?.trim().length ?? 0) >= 2) {
    next.name = input.legalName!.trim()
  }
  return next
}

export function fiscalPayloadFromForm(state: FiscalFormState): FiscalPurchasePayload {
  if (!state.invoiceRequested) {
    return { invoiceRequested: false }
  }
  return {
    invoiceRequested: true,
    fiscalPersonType: state.personType,
    fiscalName: state.name.trim(),
    fiscalDocument: digitsOnly(state.documentMasked),
    fiscalEmail: state.email.trim().toLowerCase(),
  }
}

export function validateFiscalForm(state: FiscalFormState): string | null {
  if (!state.invoiceRequested) return null
  if (state.name.trim().length < 2) return 'Informe o nome ou razão social.'
  if (state.personType === 'CNPJ') {
    if (!isValidCnpj(state.documentMasked)) return 'CNPJ inválido.'
  } else if (!isValidCpf(state.documentMasked)) {
    return 'CPF inválido.'
  }
  const email = state.email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail fiscal inválido.'
  return null
}
