import { describe, expect, it } from 'vitest'
import {
  allowedVipPushTimingsForDate,
  civilDateLabelSp,
  minutesSinceMidnightSp,
} from './vipPushTiming'

describe('vipPushTiming', () => {
  it('futuro: slots 11 e 17', () => {
    const today = civilDateLabelSp(new Date('2026-06-01T12:00:00-03:00'))
    const future = `${today.slice(0, 4)}-12-25`
    expect(allowedVipPushTimingsForDate(future, new Date('2026-06-01T12:00:00-03:00'))).toEqual([
      'SLOT_11',
      'SLOT_17',
    ])
  })

  it('hoje antes das 11: slots 11 e 17', () => {
    const today = civilDateLabelSp(new Date('2026-06-01T08:00:00-03:00'))
    const mins = minutesSinceMidnightSp(new Date('2026-06-01T08:00:00-03:00'))
    expect(mins).toBeLessThan(11 * 60)
    expect(allowedVipPushTimingsForDate(today, new Date('2026-06-01T08:00:00-03:00'))).toEqual([
      'SLOT_11',
      'SLOT_17',
    ])
  })

  it('hoje após 17: imediato', () => {
    const today = civilDateLabelSp(new Date('2026-06-01T20:00:00-03:00'))
    expect(allowedVipPushTimingsForDate(today, new Date('2026-06-01T20:00:00-03:00'))).toEqual([
      'IMMEDIATE',
    ])
  })
})
