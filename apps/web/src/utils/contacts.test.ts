import { describe, expect, it } from 'vitest'
import { telUrl, whatsappUrl } from './contacts'

describe('contacts', () => {
  it('telUrl usa dígitos E164 como Flutter', () => {
    expect(telUrl('(11) 98888-7777')).toBe('tel:+11988887777')
  })

  it('whatsappUrl monta wa.me', () => {
    expect(whatsappUrl('11988887777')).toBe('https://wa.me/11988887777')
  })
})
