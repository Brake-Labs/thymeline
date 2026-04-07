// @vitest-environment jsdom
/**
 * Tests for the Recipe Detail page.
 * Covers spec-13 test cases: T14, T15, T16, T17
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import RecipeDetailPage from '../[id]/page'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))


vi.mock('@/components/recipes/GenerateRecipeModal', () => ({
  default: ({ onClose, initialIngredients }: {
    onClose: () => void
    initialIngredients: string
  }) => (
    <div data-testid="generate-recipe-modal">
      <h2>Generate Recipe with AI</h2>
      <span data-testid="modal-ingredients">{initialIngredients}</span>
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}))

vi.mock('@/components/recipes/DeleteConfirmDialog', () => ({
  default: () => <div data-testid="delete-dialog" />,
}))

vi.mock('@/components/recipes/ShareToggle', () => ({
  default: () => <div data-testid="share-toggle" />,
}))

vi.mock('@/components/recipes/AIGeneratedBadge', () => ({
  default: () => <span data-testid="ai-badge">✦ AI generated</span>,
}))

vi.mock('@/components/recipes/TagPill', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecipe(overrides: Partial<{
  id: string
  user_id: string
  source: string
  title: string
  ingredients: string
  tags: string[]
  last_made: string | null
  times_made: number
  dates_made: string[]
}> = {}) {
  return {
    id: 'recipe-1',
    user_id: 'user-1',
    title: 'Test Recipe',
    source: 'manual',
    category: 'main_dish',
    tags: [],
    ingredients: 'eggs\nflour',
    steps: 'Mix',
    notes: null,
    url: null,
    image_url: null,
    is_shared: false,
    prep_time_minutes: null,
    cook_time_minutes: null,
    total_time_minutes: null,
    inactive_time_minutes: null,
    servings: null,
    last_made: null,
    times_made: 0,
    dates_made: [],
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function setupFetch(recipe: ReturnType<typeof makeRecipe>) {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/api/auth/get-session')) {
      // Always return user-1 as the logged-in user (matches default makeRecipe().user_id)
      return { status: 200, ok: true, json: async () => ({ user: { id: 'user-1' } }) } as Response
    }
    if (url.includes('/api/recipes/recipe-')) {
      return { status: 200, ok: true, json: async () => recipe } as Response
    }
    return { status: 200, ok: true, json: async () => ({}) } as Response
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── T14: AIGeneratedBadge appears when source === 'generated' ─────────────────

describe('T14 - AIGeneratedBadge appears on recipe detail page when source === "generated"', () => {
  it('renders the AI badge for a generated recipe', async () => {
    setupFetch(makeRecipe({ source: 'generated' }))
    render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)

    await waitFor(() => {
      expect(screen.getByTestId('ai-badge')).toBeInTheDocument()
    })
  })
})

// ── T15: AIGeneratedBadge does NOT appear when source === 'manual' ────────────

describe('T15 - AIGeneratedBadge does NOT appear when source === "manual"', () => {
  it('does not render the AI badge for a manual recipe', async () => {
    setupFetch(makeRecipe({ source: 'manual' }))
    render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('ai-badge')).not.toBeInTheDocument()
  })

  it('does not render the AI badge for a scraped recipe', async () => {
    setupFetch(makeRecipe({ source: 'scraped' }))
    render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('ai-badge')).not.toBeInTheDocument()
  })
})

// ── T16: Regenerate button appears only when isOwner && source === 'generated' ─

describe('T16 - Regenerate button appears on detail page only when isOwner && source === "generated"', () => {
  it('shows Regenerate button when owner and generated', async () => {
    setupFetch(makeRecipe({ source: 'generated', user_id: 'user-1' }))
    render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument()
    })
  })

  it('does NOT show Regenerate button when source is manual', async () => {
    setupFetch(makeRecipe({ source: 'manual', user_id: 'user-1' }))
    render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument()
  })

  it('does NOT show Regenerate button when not the owner', async () => {
    setupFetch(makeRecipe({ source: 'generated', user_id: 'other-user' }))
    render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument()
  })
})

// ── T17: Regenerate button opens modal with generate tab + ingredients pre-filled

describe('T17 - Regenerate opens GenerateRecipeModal with recipe ingredients pre-filled', () => {
  it('opens GenerateRecipeModal with current ingredients pre-filled', async () => {
    const ingredients = 'chicken breast\nlemon\ngarlic'
    setupFetch(makeRecipe({ source: 'generated', user_id: 'user-1', ingredients }))
    render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
    })

    // GenerateRecipeModal opens with heading and ingredients pre-filled
    await waitFor(() => {
      expect(screen.getByTestId('generate-recipe-modal')).toBeInTheDocument()
    })
    expect(screen.getByText('Generate Recipe with AI')).toBeInTheDocument()
    expect(screen.getByTestId('modal-ingredients').textContent).toBe(ingredients)
  })
})
