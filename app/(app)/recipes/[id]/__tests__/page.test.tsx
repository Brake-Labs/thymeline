// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const mockGetSession = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
  getSupabaseClient: () => ({
    auth: { getSession: mockGetSession },
  }),
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
  ingredients: null,
  steps: null,
  image_url: null,
  is_shared: false,
  created_at: '2025-01-01T00:00:00Z',
  last_made: null,
  times_made: 0,
  dates_made: [],
}

function makeTagsResponse() {
  return Promise.resolve({
    ok: true,
    json: async () => ({ firstClass: ['Chicken'], custom: [] }),
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  mockGetSession.mockReset()
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes('/api/tags') && (!opts?.method || opts.method === 'GET')) return makeTagsResponse()
    if (url.includes('/api/recipes/recipe-1') && (!opts?.method || opts.method === 'GET')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_RECIPE })
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
  })
})

// Lazy import so mocks are registered first
const { default: RecipeDetailPage } = await import('../page')

describe('RecipeDetailPage — Edit button owner gating', () => {
  it('shows Edit and Delete buttons when current user is the owner', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'owner-user' } } },
    })

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/recipes/recipe-1/edit')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('hides Edit and Delete buttons when current user is not the owner', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'other-user' } } },
    })

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('hides Edit and Delete buttons when not logged in', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    })

    await act(async () => {
      render(<RecipeDetailPage params={{ id: 'recipe-1' }} />)
    })

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
