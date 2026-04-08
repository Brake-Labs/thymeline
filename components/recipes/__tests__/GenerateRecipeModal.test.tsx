// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import GenerateRecipeModal from '../GenerateRecipeModal'


vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ firstClass: ['Chicken', 'Healthy'], custom: [] }),
}))

const defaultProps = {
  onClose: vi.fn(),
  onSaved: vi.fn(),
}

const BASE_GENERATED_RECIPE = {
  title:                 'Lemon Chicken',
  ingredients:           'chicken breast\nlemon',
  steps:                 'Cook it',
  tags:                  [] as string[],
  category:              'main_dish' as const,
  servings:              2,
  prepTimeMinutes:     10,
  cookTimeMinutes:     20,
  totalTimeMinutes:    30,
  inactiveTimeMinutes: null,
  notes:                 'Simple and quick',
}

const REFINE_RESPONSE = {
  message: 'Done!',
  changes: [],
  recipe:  BASE_GENERATED_RECIPE,
}

/** Set up fetch mock */
function setupFetch(generatedRecipe = BASE_GENERATED_RECIPE) {
  vi.mocked(fetch).mockImplementation(async (url, opts) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/preferences')) {
      return { ok: true, json: async () => ({ avoidedTags: [] }) } as Response
    }
    if (urlStr.includes('/api/tags')) {
      return { ok: true, json: async () => ({ firstClass: [], custom: [] }) } as Response
    }
    if (urlStr.includes('/api/recipes/generate/refine')) {
      return { ok: true, json: async () => REFINE_RESPONSE } as Response
    }
    if (urlStr.includes('/api/recipes/generate')) {
      return { ok: true, json: async () => generatedRecipe } as Response
    }
    if (urlStr === '/api/recipes' && (opts as RequestInit)?.method === 'POST') {
      return { ok: true, json: async () => ({ id: 'new-id' }) } as Response
    }
    return { ok: true, json: async () => ({ firstClass: [], custom: [] }) } as Response
  })
}

/** Render modal, wait for form, trigger generation, wait for chat panel */
async function renderAndGenerate(recipe = BASE_GENERATED_RECIPE) {
  setupFetch(recipe)
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
    expect(screen.getByRole('button', { name: /use this recipe/i })).toBeInTheDocument()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupFetch()
})

// ── T01: GenerateRecipeModal shows generate form ──────────────────────────────────────────────

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

// ── T01(25): Chat panel shown after generation (not RecipeForm) ─────────────────────

describe('T01(25) - Chat panel shown after generation', () => {
  it('shows GenerateRecipeChatPanel instead of RecipeForm after generation', async () => {
    await renderAndGenerate()
    expect(screen.getByRole('button', { name: /use this recipe/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save recipe/i })).not.toBeInTheDocument()
  })
})

// ── T12: Generated recipe pre-fills RecipeForm ────────────────────────────────────────────────

describe('T12 - Generated recipe pre-fills RecipeForm with all returned fields', () => {
  it('shows RecipeForm pre-filled after "Use this recipe"', async () => {
    await renderAndGenerate()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use this recipe/i }))
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Lemon Chicken')).toBeInTheDocument()
    })
  })
})

// ── T13: AIGeneratedBadge appears after "Use this recipe" ──────────────────────────────

describe('T13 - AIGeneratedBadge appears above RecipeForm after "Use this recipe"', () => {
  it('shows "AI generated" badge after clicking Use this recipe', async () => {
    await renderAndGenerate()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use this recipe/i }))
    })
    await waitFor(() => {
      expect(screen.getByText(/AI generated/i)).toBeInTheDocument()
    })
  })
})

// ── T18: Saving posts source: 'generated' ────────────────────────────────────────────────

describe('T18 - Saving a generated recipe calls POST /api/recipes with source: generated', () => {
  it('posts source=generated when saving', async () => {
    await renderAndGenerate()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use this recipe/i }))
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('Lemon Chicken')).toBeInTheDocument()
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

// ── T19: "Use this recipe" transitions to finalized (RecipeForm) ────────────────────

describe('T19 - Use this recipe transitions to finalized step', () => {
  it('shows RecipeForm after clicking Use this recipe', async () => {
    await renderAndGenerate()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use this recipe/i }))
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save recipe/i })).toBeInTheDocument()
    })
  })
})

// ── T20: "Start over" returns to generate tab ───────────────────────────────────────────

describe('T20 - Start over returns to generate tab', () => {
  it('shows generate form again after Start over', async () => {
    await renderAndGenerate()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start over/i }))
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g. chicken breast/i)).toBeVisible()
      expect(screen.queryByRole('button', { name: /use this recipe/i })).not.toBeInTheDocument()
    })
  })
})

// ── T22: Generate tab state preserved after "Start over" ────────────────────────────────

describe('T22 - Generate tab preserves input state after Start over', () => {
  it('retains ingredients text after Start over', async () => {
    setupFetch()
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
      expect(screen.getByRole('button', { name: /use this recipe/i })).toBeInTheDocument()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start over/i }))
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue('chicken breast')).toBeInTheDocument()
    })
  })
})

// ── T27: Re-mounted modal starts clean ───────────────────────────────────────────────

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
