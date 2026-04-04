// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DayTogglePicker from '../DayTogglePicker'

const WEEK_START = '2026-03-01' // Sunday

function allDates(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date('2026-03-01T12:00:00Z')
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]!
  })
}

// ── T05: Toggling a day off removes it from activeDates ───────────────────────

describe('T05 - Toggling a day off', () => {
  it('calls onChange without the toggled-off date', () => {
    const onChange = vi.fn()
    const dates = allDates()
    render(<DayTogglePicker weekStart={WEEK_START} activeDates={dates} onChange={onChange} />)

    fireEvent.click(screen.getByText('Mon'))
    const called = onChange.mock.calls[0]![0] as string[]
    expect(called).not.toContain('2026-03-02')
  })

  it('calls onChange with the toggled-on date when adding a day', () => {
    const onChange = vi.fn()
    render(
      <DayTogglePicker weekStart={WEEK_START} activeDates={['2026-03-01']} onChange={onChange} />
    )
    fireEvent.click(screen.getByText('Mon'))
    const called = onChange.mock.calls[0]![0] as string[]
    expect(called).toContain('2026-03-02')
  })
})

// ── T06: Cannot deactivate last active day ────────────────────────────────────

describe('T06 - Last active day cannot be deactivated', () => {
  it('shows helper text when only 1 day is active', () => {
    render(
      <DayTogglePicker weekStart={WEEK_START} activeDates={['2026-03-01']} onChange={() => {}} />
    )
    expect(screen.getByText('At least 1 day required')).toBeInTheDocument()
  })

  it('does not call onChange when clicking the only active day', () => {
    const onChange = vi.fn()
    render(
      <DayTogglePicker weekStart={WEEK_START} activeDates={['2026-03-01']} onChange={onChange} />
    )
    fireEvent.click(screen.getByText('Sun'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not show the helper text when multiple days are active', () => {
    render(
      <DayTogglePicker weekStart={WEEK_START} activeDates={allDates()} onChange={() => {}} />
    )
    expect(screen.queryByText('At least 1 day required')).not.toBeInTheDocument()
  })
})
