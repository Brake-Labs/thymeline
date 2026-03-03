// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CooldownSlider, { cooldownLabel } from '../CooldownSlider'

// ── T04: Slider label updates live while dragging ────────────────────────────
// ── T05: Slider shows "1 month" at exactly 28 days ──────────────────────────
describe('cooldownLabel helper', () => {
  it('returns "1 week" for 7', () => {
    expect(cooldownLabel(7)).toBe('1 week')
  })

  it('returns "2 weeks" for 14', () => {
    expect(cooldownLabel(14)).toBe('2 weeks')
  })

  // T05: user correction — must be "1 month" not "1 month (recommended)"
  it('T05 - returns "1 month" for 28 (not "1 month (recommended)")', () => {
    expect(cooldownLabel(28)).toBe('1 month')
    expect(cooldownLabel(28)).not.toBe('1 month (recommended)')
  })

  it('returns "2 months" for 60', () => {
    expect(cooldownLabel(60)).toBe('2 months')
  })

  it('returns "X days" for arbitrary values', () => {
    expect(cooldownLabel(10)).toBe('10 days')
    expect(cooldownLabel(30)).toBe('30 days')
    expect(cooldownLabel(1)).toBe('1 days')
  })
})

describe('T04 - CooldownSlider renders and updates label live', () => {
  it('displays the friendly label for the current value', () => {
    render(<CooldownSlider value={28} onChange={vi.fn()} />)
    expect(screen.getByText('1 month')).toBeInTheDocument()
  })

  it('calls onChange when slider moves', () => {
    const onChange = vi.fn()
    render(<CooldownSlider value={28} onChange={onChange} />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '14' } })
    expect(onChange).toHaveBeenCalledWith(14)
  })

  it('updates label when value prop changes', () => {
    const { rerender } = render(<CooldownSlider value={28} onChange={vi.fn()} />)
    expect(screen.getByText('1 month')).toBeInTheDocument()
    rerender(<CooldownSlider value={7} onChange={vi.fn()} />)
    expect(screen.getByText('1 week')).toBeInTheDocument()
  })
})
