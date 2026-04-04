// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StepperInput from '../StepperInput'

// ── T03: Stepper clamps at min=1 and max=5 ───────────────────────────────────
describe('T03 - StepperInput clamps at min and max', () => {
  it('disables minus button at min value', () => {
    const onChange = vi.fn()
    render(<StepperInput value={1} min={1} max={5} onChange={onChange} />)
    const minusBtn = screen.getByLabelText('Decrease')
    expect(minusBtn).toBeDisabled()
  })

  it('disables plus button at max value', () => {
    const onChange = vi.fn()
    render(<StepperInput value={5} min={1} max={5} onChange={onChange} />)
    const plusBtn = screen.getByLabelText('Increase')
    expect(plusBtn).toBeDisabled()
  })

  it('calls onChange with decremented value', () => {
    const onChange = vi.fn()
    render(<StepperInput value={3} min={1} max={5} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Decrease'))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('calls onChange with incremented value', () => {
    const onChange = vi.fn()
    render(<StepperInput value={3} min={1} max={5} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Increase'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('displays the current value', () => {
    render(<StepperInput value={3} min={1} max={5} onChange={vi.fn()} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})

// ── T14: Limited tag cap stepper clamps at 1 and 7 ───────────────────────────
describe('T14 - StepperInput clamps at 1 and 7 (for cap)', () => {
  it('disables minus at min=1', () => {
    render(<StepperInput value={1} min={1} max={7} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Decrease')).toBeDisabled()
  })

  it('disables plus at max=7', () => {
    render(<StepperInput value={7} min={1} max={7} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Increase')).toBeDisabled()
  })

  it('increments cap correctly', () => {
    const onChange = vi.fn()
    render(<StepperInput value={2} min={1} max={7} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Increase'))
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
