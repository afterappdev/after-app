import { describe, expect, it } from 'vitest'
import { buildHoursJson, parseHoursForm } from './venueHours'

describe('venueHours', () => {
  it('serializa fechado e horários', () => {
    const form = parseHoursForm({
      mon: { open: '09:00', close: '18:00' },
      sun: { closed: true },
    })
    const json = buildHoursJson(form)
    expect(json.mon).toEqual({ open: '09:00', close: '18:00' })
    expect(json.sun).toEqual({ closed: true })
  })
})
