// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import GenerateRecipeModal from '../GenerateRecipeModal'

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
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ firstClass: ['Chicken', 'Healthy'], custom: [] }),
  } as Response)
})

// ── T01: GenerateRecipeModal shows generate form ──────────────────────────────

describe('T01 - GenerateRecipeModal renders the generate form on open', () => {
  it('shows ingredients field on open', async () => {
    render(<GenerateRecipeModal {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g. chicken breast/i)).toBeInTheDocument()
    })
  })

  it('calls onClose when × button is clicked', () => {
    const onClose = vi.fn()
    render(<GenerateRecipeModal {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})

// ── T12: Generated recipe pre-fills RecipeForm ────────────────────────────────

describe('T12 - Generated recipe pre-fills RecipeForm with all returned fields', () => {
  it('shows RecipeForm pre-filled after generation', async () => {
    const generatedRecipe = {
      title: 'Lemon Chicken',
      ingredients: 'chicken breast\nlemon',
      steps: 'Cook it',
      tags: [],
      category: 'main_dish' as const,
      servings: 2,
      prep_time_minutes: 10,
      cook_time_minutes: 20,
      total_time_minutes: 30,
      inactive_time_minutes: null,
      notes: 'Simple and quick',
    }

    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/api/recipes/generate')) {
        return { ok: true, json: async () => generatedRecipe } as Response
      }
      return { ok: true, json: async () => ({ firstClass: [], custom: [] }) } as Response
    })

    render(<GenerateRecipeModal {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g. chicken breast/i)).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText(/e.g. chicken breast/i), {
      target: { value: 'chicken breast' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate recipe/i }))
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Lemon Chicken')).toBeInTheDocument()
    })
  })
})

// ── T13: AIGeneratedBadge appears after generation ───────────────────────────

describe('T13 - AIGeneratedBadge appears above RecipeForm after generation', () => {
  it('shows "AI generated" badge after successful generation', async () => {
    const generatedRecipe = {
      title: 'Test Recipe',
      ingredients: 'pasta',
      steps: 'Cook it',
      tags: [],
      category: 'main_dish' as const,
      servings: null,
      prep_time_minutes: null,
      cook_time_minutes: null,
      total_time_minutes: null,
      inactive_time_minutes: null,
      notes: null,
    }

    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/api/recipes/generate')) {
        return { ok: true, json: async () => generatedRecipe } as Response
      }
      return { ok: true, json: async () => ({ firstClass: [], custom: [] }) } as Response
    })

    render(<GenerateRecipeModal {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g. chicken breast/i)).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText(/e.g. chicken breast/i), {
      target: { value: 'pasta' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate recipe/i }))
    })
    await waitFor(() => {
      expect(screen.getByText(/AI generated/i)).toBeInTheDocument()
    })
  })
})

// ── T18: Saving posts source: 'generated' ────────────────────────────────────

describe('T18 - Saving a generated recipe calls POST /api/recipes with source: generated', () => {
  it('posts source=generated when saving', async () => {
    const generatedRecipe = {
      title: 'Generated Pasta',
      ingredients: 'pasta\nolive oil',
      steps: 'Boil water',
      tags: [],
      category: 'main_dish' as const,
      servings: 2,
      prep_time_minutes: null,
      cook_time_minutes: null,
      total_time_minutes: null,
      inactive_time_minutes: null,
      notes: null,
    }

    vi.mocked(fetch).mockImplementation(async (url, opts) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/recipes/generate')) {
        return { ok: true, json: async () => generatedRecipe } as Response
      }
      if (urlStr === '/api/recipes' && (opts as RequestInit)?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'new-id' }) } as Response
      }
      return { ok: true, json: async () => ({ firstClass: [], custom: [] }) } as Response
    })

    render(<GenerateRecipeModal {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g. chicken breast/i)).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText(/e.g. chicken breast/i), {
      target: { value: 'pasta' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate recipe/i }))
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Generated Pasta')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))
    })
    await waitFor(() => {
      const recipesCall = vi.mocked(fetch).mock.calls.find(
        ([u, o]) => String(u) === '/api/recipes' && (o as RequestInit)?.method === 'POST'
      )
      expect(recipesCall).toBeDefined()
      const body = JSON.parse((recipesCall![1] as RequestInit).body as string)
      expect(body.source).toBe('generated')
    })
  })
})

// ── T27: Re-mounted modal starts clean ───────────────────────────────────────

describe('T27 - Re-mounted GenerateRecipeModal starts with clean state', () => {
  it('re-mounted modal shows generate form, not stale recipe form', async () => {
    const { rerender } = render(<GenerateRecipeModal {...defaultProps} />)
    rerender(<></>)
    rerender(<GenerateRecipeModal {...defaultProps} />)
    await waitFor(() => {
      expect(screen.queryByText(/AI generated/i)).not.toBeInTheDocument()
      expect(screen.getByPlaceholderText(/e.g. chicken breast/i)).toBeInTheDocument()
    })
  })
})
