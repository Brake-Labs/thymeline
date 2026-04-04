// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CooldownSlider, { cooldownLabel } from '../CooldownSlider'

// ── T04: Slider label updates live while dragging ────────────────────────────
// ── T05: Slider label thresholds ─────────────────────────────────────────────
describe('cooldownLabel helper', () => {
  it('returns "1 week" for 7', () => {
    expect(cooldownLabel(7)).toBe('1 week')
  })

  it('returns "2 weeks" for 14', () => {
    expect(cooldownLabel(14)).toBe('2 weeks')
  })

  // T05: 28 days → "28 days" (not "1 month")
  it('T05 - returns "28 days" for 28', () => {
    expect(cooldownLabel(28)).toBe('28 days')
    expect(cooldownLabel(28)).not.toBe('1 month')
  })

  it('returns "1 month" for 30', () => {
    expect(cooldownLabel(30)).toBe('1 month')
  })

  it('returns "1 month" for 31', () => {
    expect(cooldownLabel(31)).toBe('1 month')
  })

  it('returns "2 months" for 60', () => {
    expect(cooldownLabel(60)).toBe('2 months')
  })

  it('returns "X days" for arbitrary values', () => {
    expect(cooldownLabel(10)).toBe('10 days')
    expect(cooldownLabel(1)).toBe('1 days')
    expect(cooldownLabel(45)).toBe('45 days')
  })
})

describe('T04 - CooldownSlider renders and updates label live', () => {
  it('displays the friendly label for the current value', () => {
    render(<CooldownSlider value={30} onChange={vi.fn()} />)
    // "1 month" appears as both tick label and live label — confirm at least one present
    expect(screen.getAllByText('1 month').length).toBeGreaterThanOrEqual(1)
  })

  it('displays "28 days" for value 28', () => {
    render(<CooldownSlider value={28} onChange={vi.fn()} />)
    expect(screen.getByText('28 days')).toBeInTheDocument()
  })

  it('calls onChange when slider moves', () => {
    const onChange = vi.fn()
    render(<CooldownSlider value={30} onChange={onChange} />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '14' } })
    expect(onChange).toHaveBeenCalledWith(14)
  })

  it('updates label when value prop changes', () => {
    const { rerender } = render(<CooldownSlider value={30} onChange={vi.fn()} />)
    expect(screen.getAllByText('1 month').length).toBeGreaterThanOrEqual(1)
    rerender(<CooldownSlider value={7} onChange={vi.fn()} />)
    // "1 week" appears as both tick label and live label
    expect(screen.getAllByText('1 week').length).toBeGreaterThanOrEqual(1)
  })

  it('renders tick labels', () => {
    render(<CooldownSlider value={14} onChange={vi.fn()} />)
    expect(screen.getByText('1 day')).toBeInTheDocument()
    expect(screen.getByText('2 months')).toBeInTheDocument()
  })
})
