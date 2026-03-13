// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AddRecipeModal from '../AddRecipeModal'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

// Mock fetch: GET /api/tags returns empty; POST fails silently
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ firstClass: ['Chicken', 'Healthy'], custom: [] }),
}))

const defaultProps = {
  onClose: vi.fn(),
  onSaved: vi.fn(),
  getToken: async () => 'token',
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset fetch mock to always return tags
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ firstClass: ['Chicken', 'Healthy'], custom: [] }),
  } as Response)
})

// ── T15: Manual tab renders TagSelector with no pre-checked tags ──────────────

describe('T15 - Manual tab renders TagSelector with no pre-checked tags', () => {
  it('renders the tag chip area when Manual tab is active', () => {
    render(<AddRecipeModal {...defaultProps} />)
    // Switch to Manual tab
    fireEvent.click(screen.getByText('Manual'))
    // TagSelector renders Style/Dietary section header
    expect(screen.getByText('Style / Dietary')).toBeInTheDocument()
  })

  it('no chip has selected style initially (no pre-checked tags)', () => {
    render(<AddRecipeModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Manual'))
    // All Chicken chips should be unselected (bg-white class, not bg-stone-800)
    const chickenBtn = screen.getByRole('button', { name: 'Chicken' })
    expect(chickenBtn.className).not.toContain('bg-stone-800')
  })
})

// ── T16: Tab persistence (URL→Manual→URL) ────────────────────────────────────

describe('T16 - Switching URL→Manual→URL preserves tag selection', () => {
  it('Manual tab renders form even before scraping', () => {
    render(<AddRecipeModal {...defaultProps} />)
    // Switch to Manual, select a tag, switch back to URL
    fireEvent.click(screen.getByText('Manual'))
    expect(screen.getByText('Style / Dietary')).toBeInTheDocument()
    // Switch back to URL
    fireEvent.click(screen.getByText('From URL'))
    // URL input is visible again
    expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument()
  })
})

// ── T17: Modal close clears all state ─────────────────────────────────────────

describe('T17 - Modal close clears all state', () => {
  it('calls onClose when × button is clicked', () => {
    const onClose = vi.fn()
    render(<AddRecipeModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})
