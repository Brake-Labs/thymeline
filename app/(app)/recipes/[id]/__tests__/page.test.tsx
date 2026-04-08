// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const MOCK_RECIPE = {
  id: 'recipe-1',
  user_id: 'owner-user',
  title: 'Roast Chicken',
  category: 'main_dish' as const,
  tags: ['Chicken'],
  url: null,
  notes: null,
  ingredients: '1 whole chicken',
  steps: 'Roast the chicken.',
  image_url: null,
  is_shared: false,
  created_at: '2025-01-01T00:00:00Z',
  last_made: null,
  times_made: 0,
  dates_made: [],
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  inactive_time_minutes: null,
  servings: 4,
  source: 'manual' as const,
  step_photos: [],
}

function makeTagsResponse() {
  return Promise.resolve({
    ok: true,
    json: async () => ({ firstClass: ['Chicken'], custom: [] }),
  })
}

/** Helper to build a mockFetch implementation that includes session + recipe */
function setupFetchWithSession(userId: string | null) {
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes('/api/auth/session')) {
      return Promise.resolve({
        ok: true,
        json: async () => (userId ? { user: { id: userId } } : { user: null }),
      })
    }
    if (url.includes('/api/tags') && (!opts?.method || opts.method === 'GET')) return makeTagsResponse()
    if (url.includes('/api/recipes/recipe-1') && (!opts?.method || opts.method === 'GET')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_RECIPE })
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  setupFetchWithSession(null)
})

// Lazy import so mocks are registered first
const { default: RecipeDetailPage } = await import('../page')

describe('RecipeDetailPage — source URL link', () => {
  it('renders "View original recipe →" link when recipe.url is present', async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/session')) {
        return Promise.resolve({ ok: true, json: async () => ({ user: null }) })
      }
      if (url.includes('/api/recipes/recipe-1') && (!opts?.method || opts.method === 'GET')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({ ...MOCK_RECIPE, url: 'https://example.com/roast-chicken' }),
        })
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
    })

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    const link = screen.getByRole('link', { name: 'View original recipe →' })
    expect(link).toHaveAttribute('href', 'https://example.com/roast-chicken')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('hides "View original recipe →" link when recipe.url is null', async () => {
    setupFetchWithSession(null)

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.queryByRole('link', { name: 'View original recipe →' })).not.toBeInTheDocument()
  })
})

describe('RecipeDetailPage — Edit button owner gating', () => {
  it('shows Edit and Delete buttons when current user is the owner', async () => {
    setupFetchWithSession('owner-user')

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/recipes/recipe-1/edit')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('hides Edit and Delete buttons when current user is not the owner', async () => {
    setupFetchWithSession('other-user')

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('hides Edit and Delete buttons when not logged in', async () => {
    setupFetchWithSession(null)

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

// ── spec-18 T01: "Adapt" button renders for owner ────────────────────────────

describe('spec-18 T01 - "Adapt" button renders for recipe owner', () => {
  it('shows "Adapt" button when current user is the owner', async () => {
    setupFetchWithSession('owner-user')

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.getByRole('button', { name: 'Adapt' })).toBeInTheDocument()
  })
})

// ── spec-18 T02: "Adapt" button hidden for non-owners ────────────────────────

describe('spec-18 T02 - "Adapt" button hidden for non-owners', () => {
  it('hides "Adapt" button when current user is not the owner', async () => {
    setupFetchWithSession('other-user')

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.queryByRole('button', { name: 'Adapt' })).not.toBeInTheDocument()
  })
})

// ── spec-18 T03: "Share with community" toggle removed ───────────────────────

describe('spec-18 T03 - "Share with community" toggle removed from recipe detail page', () => {
  it('does not render ShareToggle or any "Share" toggle', async () => {
    setupFetchWithSession('owner-user')

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.queryByText(/share with community/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /share/i })).not.toBeInTheDocument()
  })
})

// ── spec-18 T04: Clicking "Adapt" opens AIEditSheet ──────────────────────────

describe('spec-18 T04 - Clicking "Adapt" opens AIEditSheet', () => {
  it('opens the AI edit sheet when "Adapt" is clicked', async () => {
    setupFetchWithSession('owner-user')

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Adapt' }))

    expect(screen.getByRole('dialog', { name: 'Edit with AI' })).toBeInTheDocument()
  })
})

// ── spec-18 T12: sessionStorage key on "Cook from this version" ──────────────

describe('spec-18 T12 - "Cook from this version" stores modified recipe in sessionStorage', () => {
  it('stores the modified recipe with key ai-modified-recipe-{id}', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/session')) {
        return Promise.resolve({ ok: true, json: async () => ({ user: { id: 'owner-user' } }) })
      }
      if (url.includes('/api/recipes/recipe-1/ai-edit') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            message: 'Done',
            changes: ['Made it better'],
            recipe: {
              title: 'Roast Chicken',
              ingredients: 'modified ingredients',
              steps: 'modified steps',
              notes: null,
              servings: 4,
            },
          }),
        })
      }
      if (url.includes('/api/recipes/recipe-1') && (!opts?.method || opts.method === 'GET')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_RECIPE })
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
    })

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    // Open AI edit sheet
    fireEvent.click(screen.getByRole('button', { name: 'Adapt' }))

    // Send a message
    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'make it better' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cook from this version' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cook from this version' }))

    expect(setItemSpy).toHaveBeenCalledWith(
      'ai-modified-recipe-recipe-1',
      expect.stringContaining('modified ingredients'),
    )

    setItemSpy.mockRestore()
  })
})

// ── spec-18 T19: Closing the sheet reverts recipe preview ─────────────────────

describe('spec-18 T19 - Closing the sheet reverts recipe preview to original', () => {
  it('reverts modifiedRecipe to null when sheet is closed', async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/session')) {
        return Promise.resolve({ ok: true, json: async () => ({ user: { id: 'owner-user' } }) })
      }
      if (url.includes('/api/recipes/recipe-1/ai-edit') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            message: 'Done',
            changes: [],
            recipe: {
              title: 'Roast Chicken Modified',
              ingredients: 'modified ingredients',
              steps: 'modified steps',
              notes: null,
              servings: 4,
            },
          }),
        })
      }
      if (url.includes('/api/recipes/recipe-1') && (!opts?.method || opts.method === 'GET')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_RECIPE })
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
    })

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    // Open AI edit sheet and send a message
    fireEvent.click(screen.getByRole('button', { name: 'Adapt' }))
    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'rename it' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cook from this version' })).toBeInTheDocument()
    })

    // Close the sheet via backdrop click (which triggers onClose)
    const closeBtn = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeBtn)

    // ModifiedRecipeBadge should be gone
    await waitFor(() => {
      expect(screen.queryByText('Modified for tonight')).not.toBeInTheDocument()
    })
  })
})
