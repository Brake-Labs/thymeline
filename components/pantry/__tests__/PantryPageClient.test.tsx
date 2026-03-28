// @vitest-environment jsdom
/**
 * Tests for PantryPageClient component.
 * Covers spec-12 test cases: T10, T14
 * Covers spec-13 test case: T28
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// ── Mocks ─────────────────────────────────────────────────────────────────────

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/recipes/AddRecipeModal', () => ({
  default: ({
    initialTab,
    initialPantryEnabled,
    onClose,
  }: {
    initialTab: string
    initialPantryEnabled: boolean
    onClose: () => void
  }) => (
    <div data-testid="add-recipe-modal">
      <span data-testid="modal-tab">{initialTab}</span>
      <span data-testid="modal-pantry-enabled">{String(initialPantryEnabled)}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

// Stub child components that require complex internals
vi.mock('../PantrySection', () => ({
  default: ({ section, items }: { section: string; items: { name: string }[] }) => (
    <div data-testid={`section-${section}`}>
      <h3>{section}</h3>
      {items.map((i) => <div key={i.name}>{i.name}</div>)}
    </div>
  ),
}))

vi.mock('../AddPantryItemInput', () => ({
  default: ({ onAdd }: { onAdd: (item: unknown) => void }) => (
    <button onClick={() => onAdd({ id: 'new', name: 'test item', section: 'Produce' })}>
      Add item form
    </button>
  ),
}))

vi.mock('../ScanPantrySheet', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="scan-sheet"><button onClick={onClose}>Close scan</button></div>
  ),
}))

vi.mock('../PantryMatchSheet', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="match-sheet"><button onClick={onClose}>Close match</button></div>
  ),
}))

const TODAY = '2026-03-26'
vi.setSystemTime(new Date(TODAY + 'T12:00:00Z'))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const sampleItems = [
  {
    id: 'p1', user_id: 'u1', name: 'spinach',
    quantity: null, section: 'Produce',
    expiry_date: null, added_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'p2', user_id: 'u1', name: 'chicken breast',
    quantity: '1 lb', section: 'Proteins',
    expiry_date: null, added_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'p3', user_id: 'u1', name: 'old milk',
    quantity: null, section: 'Dairy & Eggs',
    expiry_date: '2026-03-20', added_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
]

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ items: sampleItems }),
  })
})

import PantryPageClient from '../PantryPageClient'

// ── T10: Pantry screen groups items by section ────────────────────────────────

describe('T10 - Pantry screen groups items by section', () => {
  it('renders section headers for each item group', async () => {
    render(<PantryPageClient />)

    await waitFor(() => {
      // Should have section headers
      expect(screen.getByText(/produce/i)).toBeDefined()
      expect(screen.getByText(/proteins/i)).toBeDefined()
      expect(screen.getByText(/dairy/i)).toBeDefined()
    })
  })

  it('shows item names within their sections', async () => {
    render(<PantryPageClient />)

    await waitFor(() => {
      expect(screen.getByText('spinach')).toBeDefined()
      expect(screen.getByText('chicken breast')).toBeDefined()
    })
  })
})

// ── T14: "Clear expired" removes only expired items ───────────────────────────

describe('T14 - "Clear expired" removes only expired items', () => {
  it('shows "Clear X expired items" button when expired items exist', async () => {
    render(<PantryPageClient />)

    await waitFor(() => {
      // old milk is expired (2026-03-20 is before 2026-03-26)
      const clearBtn = screen.queryByText(/clear.*expired/i)
      expect(clearBtn).not.toBeNull()
    })
  })

  it('calls DELETE /api/pantry with only expired item IDs', async () => {
    render(<PantryPageClient />)

    await waitFor(() => {
      const clearBtn = screen.queryByText(/clear.*expired/i)
      expect(clearBtn).not.toBeNull()
    })

    const clearBtn = screen.getByText(/clear.*expired/i)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    fireEvent.click(clearBtn)

    await waitFor(() => {
      const deleteCalls = mockFetch.mock.calls.filter(
        ([url, opts]: [string, RequestInit]) =>
          url === '/api/pantry' && opts?.method === 'DELETE',
      )
      expect(deleteCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(deleteCalls[0][1].body as string)
      // Should only include the expired item (p3), not p1 or p2
      expect(body.ids).toContain('p3')
      expect(body.ids).not.toContain('p1')
      expect(body.ids).not.toContain('p2')
    })
  })
})

// ── T28: Pantry page "Generate new recipe" button opens modal at generate tab ──

describe('T28 - Pantry page "Generate new recipe" button opens modal at generate tab with pantry toggle pre-on', () => {
  it('renders the "Generate new recipe" button', async () => {
    render(<PantryPageClient />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate new recipe/i })).toBeInTheDocument()
    })
  })

  it('opens AddRecipeModal when button is clicked', async () => {
    render(<PantryPageClient />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate new recipe/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /generate new recipe/i }))

    await waitFor(() => {
      expect(screen.getByTestId('add-recipe-modal')).toBeInTheDocument()
    })
  })

  it('opens modal with initialTab="generate"', async () => {
    render(<PantryPageClient />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate new recipe/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /generate new recipe/i }))

    await waitFor(() => {
      expect(screen.getByTestId('modal-tab').textContent).toBe('generate')
    })
  })

  it('opens modal with initialPantryEnabled=true', async () => {
    render(<PantryPageClient />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate new recipe/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /generate new recipe/i }))

    await waitFor(() => {
      expect(screen.getByTestId('modal-pantry-enabled').textContent).toBe('true')
    })
  })

  it('closes the modal when onClose is called', async () => {
    render(<PantryPageClient />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate new recipe/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /generate new recipe/i }))

    await waitFor(() => {
      expect(screen.getByTestId('add-recipe-modal')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByTestId('add-recipe-modal')).not.toBeInTheDocument()
    })
  })
})
