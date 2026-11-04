import { describe, expect, it } from 'vitest'
import { isValidCnpj, isValidCpf } from './brDocument'

describe('brDocument', () => {
  it('valida CPF conhecido de teste', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('111.111.111-11')).toBe(false)
  })

  it('valida CNPJ formato', () => {
    expect(isValidCnpj('11.444.777/0001-61')).toBe(true)
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false)
  })
})
