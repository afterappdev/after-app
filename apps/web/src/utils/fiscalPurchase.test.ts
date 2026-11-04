import { describe, expect, it } from 'vitest'
import { fiscalPayloadFromForm, validateFiscalForm } from './fiscalPurchase'

describe('fiscalPurchase', () => {
  it('sem nota envia invoiceRequested false', () => {
    expect(fiscalPayloadFromForm({
      invoiceRequested: false,
      personType: 'CPF',
      name: '',
      documentMasked: '',
      email: '',
      emailTouched: false,
    })).toEqual({ invoiceRequested: false })
  })

  it('com nota valida CPF', () => {
    const err = validateFiscalForm({
      invoiceRequested: true,
      personType: 'CPF',
      name: 'João',
      documentMasked: '529.982.247-25',
      email: 'a@b.com',
      emailTouched: true,
    })
    expect(err).toBeNull()
  })
})
