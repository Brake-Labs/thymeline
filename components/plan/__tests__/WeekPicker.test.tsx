// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WeekPicker from '../WeekPicker'

// Fix "current Sunday" to 2026-03-01 (a Sunday)
const FIXED_SUNDAY = '2026-03-01'
const FIXED_DATE = new Date('2026-03-04T12:00:00Z') // mid-week Wednesday

beforeEach(() => {
  vi.setSystemTime(FIXED_DATE)
})

afterEach(() => {
  vi.useRealTimers()
})

// ── T01: Defaults to current week's Sunday ────────────────────────────────────

describe('T01 - WeekPicker initialisation', () => {
  it('displays the correct week range for the given weekStart', () => {
    render(<WeekPicker weekStart={FIXED_SUNDAY} onChange={() => {}} />)
    // Mar 1 – Mar 7
    expect(screen.getByText(/Mar 1/)).toBeInTheDocument()
    expect(screen.getByText(/Mar 7/)).toBeInTheDocument()
  })
})

// ── T02: Week navigation ──────────────────────────────────────────────────────

describe('T02 - Week navigation changes the range display', () => {
  it('clicking Next advances by 7 days', () => {
    const onChange = vi.fn()
    render(<WeekPicker weekStart={FIXED_SUNDAY} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Next week'))
    expect(onChange).toHaveBeenCalledWith('2026-03-08')
  })

  it('clicking Prev goes back 7 days', () => {
    const onChange = vi.fn()
    render(<WeekPicker weekStart='2026-03-08' onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Previous week'))
    expect(onChange).toHaveBeenCalledWith('2026-03-01')
  })
})

// ── T03: Left arrow disabled on current week ──────────────────────────────────

describe('T03 - Left arrow disabled on current week', () => {
  it('prev button is disabled when weekStart === currentSunday', () => {
    render(<WeekPicker weekStart={FIXED_SUNDAY} onChange={() => {}} />)
    expect(screen.getByLabelText('Previous week')).toBeDisabled()
  })

  it('prev button is enabled for a future week', () => {
    render(<WeekPicker weekStart='2026-03-08' onChange={() => {}} />)
    expect(screen.getByLabelText('Previous week')).not.toBeDisabled()
  })
})

// ── T04: Right arrow disabled at 4-week cap ───────────────────────────────────

describe('T04 - Right arrow disabled 4 weeks ahead', () => {
  it('next button is disabled at 4 weeks ahead (2026-03-29)', () => {
    render(<WeekPicker weekStart='2026-03-29' onChange={() => {}} />)
    expect(screen.getByLabelText('Next week')).toBeDisabled()
  })

  it('next button is enabled 3 weeks ahead', () => {
    render(<WeekPicker weekStart='2026-03-22' onChange={() => {}} />)
    expect(screen.getByLabelText('Next week')).not.toBeDisabled()
  })
})
