// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PostSaveModal from '../PostSaveModal'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

beforeEach(() => mockPush.mockClear())

// ── T31: Post-save modal appears ──────────────────────────────────────────────

describe('T31 - PostSaveModal renders when open', () => {
  it('shows "Plan saved!" heading when isOpen=true', () => {
    render(<PostSaveModal weekStart="2026-03-01" isOpen={true} />)
    expect(screen.getByText('Plan saved!')).toBeInTheDocument()
  })

  it('does not render when isOpen=false', () => {
    render(<PostSaveModal weekStart="2026-03-01" isOpen={false} />)
    expect(screen.queryByText('Plan saved!')).not.toBeInTheDocument()
  })

  it('has no dismiss/close mechanism', () => {
    render(<PostSaveModal weekStart="2026-03-01" isOpen={true} />)
    expect(screen.queryByLabelText(/close/i)).not.toBeInTheDocument()
  })
})

// ── T32: Make my grocery list ─────────────────────────────────────────────────

describe('T32 - Make my grocery list navigates correctly', () => {
  it('navigates to /groceries?week_start= when clicked', () => {
    render(<PostSaveModal weekStart="2026-03-01" isOpen={true} />)
    fireEvent.click(screen.getByText('Make my grocery list'))
    expect(mockPush).toHaveBeenCalledWith('/groceries?week_start=2026-03-01')
  })
})

// ── T33: Go to home ───────────────────────────────────────────────────────────

describe('T33 - Go to home navigates to /home', () => {
  it('navigates to /home when clicked', () => {
    render(<PostSaveModal weekStart="2026-03-01" isOpen={true} />)
    fireEvent.click(screen.getByText('Go to home'))
    expect(mockPush).toHaveBeenCalledWith('/home')
  })
})
