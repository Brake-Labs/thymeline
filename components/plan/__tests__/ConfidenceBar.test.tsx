// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ConfidenceBar from '../ConfidenceBar'

// ── T12: ConfidenceBar renders correct segments ──────────────────────────────

describe('T12 - ConfidenceBar renders correct number of filled segments', () => {
  it('renders 0 filled segments for score 0', () => {
    const { container } = render(<ConfidenceBar score={0} />)
    const bar = container.querySelector('[aria-label]')!
    const segments = bar.querySelectorAll(':scope > div')
    const filled = [...segments].filter((s) => s.classList.contains('bg-sage-500'))
    expect(filled).toHaveLength(0)
    expect(segments).toHaveLength(4)
  })

  it('renders 2 filled segments for score 2', () => {
    const { container } = render(<ConfidenceBar score={2} />)
    const bar = container.querySelector('[aria-label]')!
    const segments = bar.querySelectorAll(':scope > div')
    const filled = [...segments].filter((s) => s.classList.contains('bg-sage-500'))
    expect(filled).toHaveLength(2)
  })

  it('renders 4 filled segments for score 4', () => {
    const { container } = render(<ConfidenceBar score={4} />)
    const bar = container.querySelector('[aria-label]')!
    const segments = bar.querySelectorAll(':scope > div')
    const filled = [...segments].filter((s) => s.classList.contains('bg-sage-500'))
    expect(filled).toHaveLength(4)
  })

  it('clamps score above 4 to 4 filled segments', () => {
    const { container } = render(<ConfidenceBar score={7} />)
    const bar = container.querySelector('[aria-label]')!
    const segments = bar.querySelectorAll(':scope > div')
    const filled = [...segments].filter((s) => s.classList.contains('bg-sage-500'))
    expect(filled).toHaveLength(4)
  })
})
