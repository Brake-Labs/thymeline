// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

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
  user_id: 'user-1',
  title: 'Chicken Soup',
  category: 'main_dish' as const,
  tags: ['Chicken', 'Soup'],
  url: null,
  notes: null,
  ingredients: '1 whole chicken\n2 carrots',
  steps: 'Boil the chicken.\nAdd carrots.',
  image_url: null,
  is_shared: false,
  created_at: '2025-01-01T00:00:00Z',
}

function makeTagsResponse() {
  return Promise.resolve({
    ok: true,
    json: async () => ({ firstClass: ['Chicken', 'Soup', 'Gluten-Free', 'Quick'], custom: [] }),
  })
}

beforeEach(() => {
  mockPush.mockClear()
  mockFetch.mockReset()
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes('/api/tags') && (!opts?.method || opts.method === 'GET')) return makeTagsResponse()
    if (url.includes('/api/recipes/recipe-1') && (!opts?.method || opts.method === 'GET')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_RECIPE })
    }
    if (url.includes('/api/recipes/recipe-1') && opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ...MOCK_RECIPE }) })
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
  })
})

// Lazy import so mocks are registered first
const { default: EditRecipePage } = await import('../page')

// ── T18: Edit form renders with existing recipe tags pre-selected ─────────────
describe('T18 - Edit form renders existing tags as selected', () => {
  it('shows recipe tags pre-selected in TagSelector', async () => {
    await act(async () => {
      render(<EditRecipePage params={{ id: 'recipe-1' }} />)
    })

    await waitFor(() => {
      // Both existing recipe tags should be rendered as selected chips
      const chickenChip = screen.getByRole('button', { name: 'Chicken' })
      const soupChip = screen.getByRole('button', { name: 'Soup' })
      expect(chickenChip.className).toContain('bg-stone-800')
      expect(soupChip.className).toContain('bg-stone-800')
    })
  })

  it('shows unrelated tags as unselected', async () => {
    await act(async () => {
      render(<EditRecipePage params={{ id: 'recipe-1' }} />)
    })

    await waitFor(() => {
      const glutenFreeChip = screen.getByRole('button', { name: 'Gluten-Free' })
      expect(glutenFreeChip.className).not.toContain('bg-stone-800')
    })
  })
})

// ── T19: Submit sends updated tags in PATCH body ──────────────────────────────
describe('T19 - Submit sends updated tags in PATCH request', () => {
  it('PATCH body includes tags array from TagSelector', async () => {
    await act(async () => {
      render(<EditRecipePage params={{ id: 'recipe-1' }} />)
    })

    // Wait for form to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Chicken Soup')).toBeInTheDocument()
    })

    // Toggle Gluten-Free on (adding to the two existing tags)
    fireEvent.click(screen.getByRole('button', { name: 'Gluten-Free' }))

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))
    })

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/api/recipes/recipe-1') && opts?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
      const body = JSON.parse(patchCall![1].body)
      expect(body.tags).toContain('Chicken')
      expect(body.tags).toContain('Soup')
      expect(body.tags).toContain('Gluten-Free')
    })
  })

  it('PATCH body reflects tag removal', async () => {
    await act(async () => {
      render(<EditRecipePage params={{ id: 'recipe-1' }} />)
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Chicken Soup')).toBeInTheDocument()
    })

    // Deselect Soup
    fireEvent.click(screen.getByRole('button', { name: 'Soup' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save recipe/i }))
    })

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/api/recipes/recipe-1') && opts?.method === 'PATCH',
      )
      const body = JSON.parse(patchCall![1].body)
      expect(body.tags).toContain('Chicken')
      expect(body.tags).not.toContain('Soup')
    })
  })
})
