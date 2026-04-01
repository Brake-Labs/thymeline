/**
 * Tests for DateInput component
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DateInput from '../DateInput'

// ── Date util mocks ───────────────────────────────────────────────────────────

vi.mock('@/lib/date-utils', () => ({
  getTodayISO:     () => '2026-04-01',
  formatShortDate: (iso: string) => {
    const [, m, d] = iso.split('-')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${months[parseInt(m!, 10) - 1]} ${parseInt(d!, 10)}`
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup(props: Partial<React.ComponentProps<typeof DateInput>> = {}) {
  const onChange = props.onChange ?? vi.fn()
  const result = render(
    <DateInput value="" onChange={onChange} {...props} />,
  )
  return { ...result, onChange }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DateInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders placeholder text when no value', () => {
    setup({ placeholder: 'Choose a date' })
    expect(screen.getByText('Choose a date')).toBeTruthy()
  })

  it('renders default placeholder when none provided', () => {
    setup()
    expect(screen.getByText('Pick a date')).toBeTruthy()
  })

  it('renders formatted date when value is set', () => {
    setup({ value: '2026-04-01' })
    expect(screen.getByText('Apr 1')).toBeTruthy()
  })

  it('opens calendar when trigger button is clicked', () => {
    setup()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    expect(screen.getByRole('dialog', { name: /choose date/i })).toBeTruthy()
  })

  it('closes calendar when Escape is pressed', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('calls onChange with ISO string when a day is selected', () => {
    const onChange = vi.fn()
    setup({ onChange, value: '' })
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    // Click day 15 in the visible month (April 2026 — today is 2026-04-01)
    const day15 = screen.getByRole('button', { name: '2026-04-15' })
    fireEvent.click(day15)
    expect(onChange).toHaveBeenCalledWith('2026-04-15')
  })

  it('closes calendar after day is selected', () => {
    setup({ value: '' })
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    fireEvent.click(screen.getByRole('button', { name: '2026-04-10' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows X clear button when value is set', () => {
    setup({ value: '2026-04-01' })
    expect(screen.getByLabelText('Clear date')).toBeTruthy()
  })

  it('calls onChange with "" when clear is clicked', () => {
    const onChange = vi.fn()
    setup({ value: '2026-04-01', onChange })
    fireEvent.click(screen.getByLabelText('Clear date'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does not show clear button when value is empty', () => {
    setup({ value: '' })
    expect(screen.queryByLabelText('Clear date')).toBeNull()
  })

  it('disables days before min', () => {
    setup({ value: '', min: '2026-04-10' })
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    const day5 = screen.getByRole('button', { name: '2026-04-05' })
    expect(day5).toBeDisabled()
  })

  it('disables days after max', () => {
    setup({ value: '', max: '2026-04-20' })
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    const day25 = screen.getByRole('button', { name: '2026-04-25' })
    expect(day25).toBeDisabled()
  })

  it('does not call onChange when a disabled day is clicked', () => {
    const onChange = vi.fn()
    setup({ value: '', max: '2026-04-20', onChange })
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    const day25 = screen.getByRole('button', { name: '2026-04-25' })
    fireEvent.click(day25)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('navigates to next month when next-month button is clicked', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    expect(screen.getByText('April 2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText('May 2026')).toBeTruthy()
  })

  it('navigates to previous month when prev-month button is clicked', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /pick a date/i }))
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }))
    expect(screen.getByText('March 2026')).toBeTruthy()
  })

  it('wraps year correctly when navigating from January backward', () => {
    setup({ value: '2026-01-15' })
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }))
    expect(screen.getByText('December 2025')).toBeTruthy()
  })

  it('wraps year correctly when navigating from December forward', () => {
    setup({ value: '2025-12-01' })
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText('January 2026')).toBeTruthy()
  })

  it('trigger button is disabled when disabled prop is set', () => {
    setup({ disabled: true })
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('forwards id to the hidden input', () => {
    setup({ id: 'last-made' })
    const hidden = document.getElementById('last-made')
    expect(hidden).not.toBeNull()
  })
})
