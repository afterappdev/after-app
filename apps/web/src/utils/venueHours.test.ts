import { describe, expect, it } from 'vitest'
import { buildHoursJson, parseHoursForm } from './venueHours'

describe('venueHours', () => {
  it('serializa fechado e horários (legado)', () => {
    const form = parseHoursForm({
      mon: { open: '09:00', close: '18:00' },
      sun: { closed: true },
    })
    const json = buildHoursJson(form)
    expect(json.mon).toEqual({ open: '09:00', close: '18:00' })
    expect(json.sun).toEqual({ closed: true })
  })

  it('períodos múltiplos e meta', () => {
    const form = parseHoursForm({
      _hoursMeta: { mode: 'split' },
      mon: {
        closed: false,
        periods: [
          { open: '11:00', close: '14:30' },
          { open: '18:00', close: '23:00' },
        ],
      },
    })
    expect(form.mode).toBe('split')
    const json = buildHoursJson(form)
    expect(json._hoursMeta).toEqual({ mode: 'split' })
    expect(json.mon).toEqual({
      closed: false,
      periods: [
        { open: '11:00', close: '14:30' },
        { open: '18:00', close: '23:00' },
      ],
    })
  })
})
