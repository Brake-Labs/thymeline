// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MealTypePicker from '../MealTypePicker'
import type { MealType } from '@/types'

// ── T22: Dinner pre-selected ──────────────────────────────────────────────────

describe('T22 - MealTypePicker with Dinner pre-selected', () => {
  it('renders all four pill toggles', () => {
    render(<MealTypePicker selected={['dinner']} onChange={vi.fn()} />)
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.getByText('Dinner')).toBeInTheDocument()
    expect(screen.getByText('Snacks')).toBeInTheDocument()
  })

  it('Dinner pill has aria-pressed=true when selected', () => {
    render(<MealTypePicker selected={['dinner']} onChange={vi.fn()} />)
    const dinnerBtn = screen.getByRole('button', { name: 'Dinner' })
    expect(dinnerBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('non-selected pills have aria-pressed=false', () => {
    render(<MealTypePicker selected={['dinner']} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Breakfast' })).toHaveAttribute('aria-pressed', 'false')
  })
})

// ── T23: Last active pill is non-interactive ──────────────────────────────────

describe('T23 - MealTypePicker cannot deselect the last active meal type', () => {
  it('the last active pill is disabled', () => {
    render(<MealTypePicker selected={['dinner']} onChange={vi.fn()} />)
    const dinnerBtn = screen.getByRole('button', { name: 'Dinner' })
    expect(dinnerBtn).toBeDisabled()
  })

  it('shows helper text when only one is selected', () => {
    render(<MealTypePicker selected={['dinner']} onChange={vi.fn()} />)
    expect(screen.getByText('At least 1 meal type required')).toBeInTheDocument()
  })

  it('does not call onChange when clicking the last active pill', () => {
    const onChange = vi.fn()
    render(<MealTypePicker selected={['dinner']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dinner' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('calls onChange when toggling a non-last pill', () => {
    const onChange = vi.fn()
    render(<MealTypePicker selected={['dinner', 'breakfast']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Breakfast' }))
    expect(onChange).toHaveBeenCalledWith(['dinner'])
  })

  it('adds a meal type when clicking an inactive pill', () => {
    const onChange = vi.fn()
    render(<MealTypePicker selected={['dinner']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }))
    expect(onChange).toHaveBeenCalledWith(['dinner', 'lunch'])
  })

  it('does not show helper text when multiple are selected', () => {
    render(<MealTypePicker selected={['dinner', 'lunch']} onChange={vi.fn()} />)
    expect(screen.queryByText('At least 1 meal type required')).not.toBeInTheDocument()
  })
})
