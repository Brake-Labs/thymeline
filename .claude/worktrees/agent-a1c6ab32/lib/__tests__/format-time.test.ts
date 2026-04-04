import { describe, it, expect } from 'vitest'
import { formatMinutes } from '@/lib/format-time'

describe('formatMinutes', () => {
  it('returns — for null', () => {
    expect(formatMinutes(null)).toBe('—')
  })

  it('returns — for 0', () => {
    expect(formatMinutes(0)).toBe('—')
  })

  it('returns "X min" for values under 60', () => {
    expect(formatMinutes(15)).toBe('15 min')
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(59)).toBe('59 min')
  })

  it('returns "X hr" for exact hours', () => {
    expect(formatMinutes(60)).toBe('1 hr')
    expect(formatMinutes(120)).toBe('2 hr')
    expect(formatMinutes(180)).toBe('3 hr')
  })

  it('returns "X hr Y min" for hours and minutes', () => {
    expect(formatMinutes(90)).toBe('1 hr 30 min')
    expect(formatMinutes(75)).toBe('1 hr 15 min')
    expect(formatMinutes(130)).toBe('2 hr 10 min')
  })
})
