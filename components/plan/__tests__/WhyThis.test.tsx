// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WhyThis from '../WhyThis'

// ── T13: WhyThis renders explanation or nothing ──────────────────────────────

describe('T13 - WhyThis component', () => {
  it('renders explanation text when provided', () => {
    render(<WhyThis text="Quick picks for Monday" />)
    expect(screen.getByText('Quick picks for Monday')).toBeInTheDocument()
  })

  it('renders nothing when text is undefined', () => {
    const { container } = render(<WhyThis text={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when text is empty string', () => {
    const { container } = render(<WhyThis text="" />)
    expect(container.innerHTML).toBe('')
  })
})
