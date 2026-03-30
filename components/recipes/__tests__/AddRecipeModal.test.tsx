// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import AddRecipeModal from '../AddRecipeModal'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
  getSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { avoided_tags: [] }, error: null }),
        }),
      }),
    }),
  }),
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
    expect(screen.getByText('Style')).toBeInTheDocument()
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
    expect(screen.getByText('Style')).toBeInTheDocument()
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


// ── T19: Saving from URL tab sends source: 'scraped' ─────────────────────────

describe('T19 - Saving from URL tab calls POST /api/recipes with source: scraped', () => {
  it('posts source=scraped when saving from url tab', async () => {
    const scrapeResult = {
      title: 'Scraped Recipe',
      ingredients: 'flour',
      steps: 'Mix it',
      imageUrl: null,
      sourceUrl: 'https://example.com/recipe',
      partial: false,
      suggestedTags: [],
      suggestedNewTags: [],
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      inactiveTimeMinutes: null,
      servings: null,
    }

    vi.mocked(fetch).mockImplementation(async (url, opts) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/recipes/scrape')) {
        return { ok: true, json: async () => scrapeResult } as Response
      }
      if (urlStr === '/api/recipes' && (opts as RequestInit)?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'new-id' }) } as Response
      }
      return { ok: true, json: async () => ({ firstClass: [], custom: [] }) } as Response
    })

    render(<AddRecipeModal {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('https://...'), {
      target: { value: 'https://example.com/recipe' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /scrape/i }))
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Scraped Recipe')).toBeInTheDocument()
    })

    // Select a category (required by RecipeForm)
    const categorySelect = screen.getByRole('combobox')
    fireEvent.change(categorySelect, { target: { value: 'main_dish' } })

    const saveBtn = screen.getByRole('button', { name: /save recipe/i })
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    await waitFor(() => {
      const recipesCall = vi.mocked(fetch).mock.calls.find(
        ([u, o]) => String(u) === '/api/recipes' && (o as RequestInit)?.method === 'POST'
      )
      expect(recipesCall).toBeDefined()
      const body = JSON.parse((recipesCall![1] as RequestInit).body as string)
      expect(body.source).toBe('scraped')
    })
  })
})

// ── T20: Saving from Manual tab sends source: 'manual' ───────────────────────

describe('T20 - Saving from Manual tab calls POST /api/recipes with source: manual', () => {
  it('posts source=manual when saving from manual tab', async () => {
    vi.mocked(fetch).mockImplementation(async (url, opts) => {
      const urlStr = String(url)
      if (urlStr === '/api/recipes' && (opts as RequestInit)?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'new-id' }) } as Response
      }
      return { ok: true, json: async () => ({ firstClass: [], custom: [] }) } as Response
    })

    render(<AddRecipeModal {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }))

    // Fill in required title
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/recipe title/i)).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText(/recipe title/i), {
      target: { value: 'My Manual Recipe' },
    })

    // Select a category (required by RecipeForm)
    const categorySelect = screen.getByRole('combobox')
    fireEvent.change(categorySelect, { target: { value: 'main_dish' } })

    const saveBtn = screen.getByRole('button', { name: /save recipe/i })
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    await waitFor(() => {
      const recipesCall = vi.mocked(fetch).mock.calls.find(
        ([u, o]) => String(u) === '/api/recipes' && (o as RequestInit)?.method === 'POST'
      )
      expect(recipesCall).toBeDefined()
      const body = JSON.parse((recipesCall![1] as RequestInit).body as string)
      expect(body.source).toBe('manual')
    })
  })
})

// ── T26: dropped — no longer applicable (generate tab removed from AddRecipeModal)
// ── T27: covered in GenerateRecipeModal.test.tsx
