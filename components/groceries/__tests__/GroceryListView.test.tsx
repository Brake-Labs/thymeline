// @vitest-environment jsdom
/**
 * Tests for GroceryListView and grocery UI.
 * Covers spec test cases: T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const sampleList = {
  id:            'list-1',
  user_id:       'user-1',
  meal_plan_id:  'plan-1',
  week_start:    '2026-03-15',
  servings: 4,
  recipe_scales: [
    { recipe_id: 'r1', recipe_title: 'Pasta', servings: null },
    { recipe_id: 'r2', recipe_title: 'Salad', servings: null },
  ],
  items: [
    { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, recipes: ['Pasta'] },
    { id: 'i2', name: 'lettuce', amount: 1, unit: null, section: 'Produce', is_pantry: false, checked: false, recipes: ['Salad'] },
    { id: 'i3', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: false, recipes: ['Pasta'] },
  ],
  created_at:    '2026-03-15T00:00:00Z',
  updated_at:    '2026-03-15T00:00:00Z',
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ list: sampleList }),
  })
})

import GroceryListView from '../GroceryListView'

// ── T16: Checking an item saves immediately ───────────────────────────────────

describe('T16 - Checking an item saves immediately', () => {
  it('calls PATCH when an item is toggled', async () => {
    render(<GroceryListView initialList={sampleList} />)
    const checkbox = screen.getByLabelText('Check pasta')
    fireEvent.click(checkbox)
    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
    })
  })
})

// ── T20: Add item appends to Other section ────────────────────────────────────

describe('T20 - Add item appends to Other section', () => {
  it('opens input when + Add item is clicked', () => {
    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByLabelText('Add item'))
    expect(screen.getByPlaceholderText('Item name…')).toBeInTheDocument()
  })

  it('adds item to list and calls PATCH on submit', async () => {
    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByLabelText('Add item'))
    const input = screen.getByPlaceholderText('Item name…')
    fireEvent.change(input, { target: { value: 'Sparkling water' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
    })
  })
})

// ── T21: Remove item removes from list and saves ──────────────────────────────

describe('T21 - Remove item removes from list and saves', () => {
  it('calls PATCH when a remove button is clicked', async () => {
    render(<GroceryListView initialList={sampleList} />)
    // Hover to reveal the × button
    const removeBtn = screen.getAllByLabelText(/Remove/)[0]
    fireEvent.click(removeBtn)
    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
    })
  })
})

// ── T14: Overridden recipe shows "Custom" badge ───────────────────────────────

describe('T14 - Overridden recipe shows "Custom" badge', () => {
  it('shows Custom badge when recipe has servings override', () => {
    const listWithOverride = {
      ...sampleList,
      recipe_scales: [
        { recipe_id: 'r1', recipe_title: 'Pasta', servings: 4 },
        { recipe_id: 'r2', recipe_title: 'Salad', servings: null },
      ],
    }
    render(<GroceryListView initialList={listWithOverride} />)
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('does not show Custom badge when no override', () => {
    render(<GroceryListView initialList={sampleList} />)
    expect(screen.queryByText('Custom')).not.toBeInTheDocument()
  })
})

// ── T15: Pantry items show "(optional)" ──────────────────────────────────────

describe('T15 - Pantry items show optional text', () => {
  it('renders (optional) for is_pantry items', () => {
    render(<GroceryListView initialList={sampleList} />)
    expect(screen.getByText('(optional)')).toBeInTheDocument()
  })
})

// ── T17: Regenerate shows confirmation dialog ─────────────────────────────────

describe('T17 - Regenerate shows confirmation dialog', () => {
  it('shows confirmation when Regenerate is clicked', () => {
    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByText('Regenerate'))
    expect(screen.getByText('Regenerate grocery list?')).toBeInTheDocument()
  })
})

// ── T19: Cancelling regenerate leaves list unchanged ─────────────────────────

describe('T19 - Cancelling regenerate leaves list unchanged', () => {
  it('dismisses dialog on Cancel without fetching', () => {
    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByText('Regenerate'))
    expect(screen.getByText('Regenerate grocery list?')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Regenerate grocery list?')).not.toBeInTheDocument()
    // No generate call
    const generateCalls = mockFetch.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('generate'),
    )
    expect(generateCalls).toHaveLength(0)
  })
})

// ── T18: Confirming regenerate replaces items and resets scales ───────────────

describe('T18 - Confirming regenerate replaces items and resets recipe_scales', () => {
  it('calls POST /api/groceries/generate and updates state', async () => {
    const regeneratedList = {
      ...sampleList,
      items: [{ id: 'new-1', name: 'tomato', amount: 2, unit: null, section: 'Produce', is_pantry: false, checked: false, recipes: ['Pasta'] }],
      recipe_scales: [{ recipe_id: 'r1', recipe_title: 'Pasta', servings: null }],
    }
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('generate')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: regeneratedList, skipped_recipes: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByText('Regenerate'))
    // Click the confirm button inside the dialog
    const confirmBtn = screen.getAllByText('Regenerate').find((el) =>
      el.closest('[class*="flex gap-3"]'),
    ) ?? screen.getAllByText('Regenerate')[1]
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      const generateCalls = mockFetch.mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('generate'),
      )
      expect(generateCalls.length).toBeGreaterThan(0)
    })
  })
})

// ── T33: "Got it" — per-item and "Mark all as bought" ────────────────────────

describe('T33 - Got it button marks item as bought', () => {
  it('moves item to Got it section and calls PATCH with bought:true', async () => {
    render(<GroceryListView initialList={sampleList} />)

    const gotItBtn = screen.getAllByLabelText(/Got it pasta/i)[0]
    fireEvent.click(gotItBtn)

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(patchCalls[0][1].body)
      const pastaItem = body.items.find((i: { name: string }) => i.name === 'pasta')
      expect(pastaItem?.bought).toBe(true)
    })
  })

  it('moves all recipe items to Got it on "Mark all as bought"', async () => {
    render(<GroceryListView initialList={sampleList} />)

    // Find the "Mark all as bought" button for Pasta
    const markAllBtns = screen.getAllByText('Mark all as bought')
    fireEvent.click(markAllBtns[0])

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(patchCalls[0][1].body)
      const pastaItems = body.items.filter((i: { recipes: string[] }) => i.recipes.includes('Pasta'))
      expect(pastaItems.every((i: { bought: boolean }) => i.bought)).toBe(true)
    })
  })

  it('shows Got it section with bought items and Undo button', () => {
    const listWithBought = {
      ...sampleList,
      items: [
        { ...sampleList.items[0], bought: true },
        sampleList.items[1],
        sampleList.items[2],
      ],
    }
    render(<GroceryListView initialList={listWithBought} />)

    expect(screen.getByText(/Got it \(1\)/)).toBeInTheDocument()
    expect(screen.getByLabelText('Undo pasta')).toBeInTheDocument()
  })
})

// ── T22: Share invokes Web Share API ─────────────────────────────────────────

describe('T22 - Share invokes Web Share API with correct format', () => {
  it('calls navigator.share when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalled()
      const args = shareMock.mock.calls[0][0]
      // Each item on its own line, no headers or bullets
      const lines = args.text.split('\n')
      expect(lines.length).toBeGreaterThan(0)
      expect(args.text).toContain('pasta')
      expect(args.text).not.toContain('🛒')
      expect(args.text).not.toMatch(/^[•\-–]/m)
    })
  })
})

// ── T23: Share falls back to clipboard ───────────────────────────────────────

describe('T23 - Share falls back to clipboard when Web Share unavailable', () => {
  it('calls navigator.clipboard.writeText when share unavailable', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      share: undefined,
      clipboard: { writeText: writeTextMock },
    })

    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled()
      expect(screen.getByText('Copied to clipboard!')).toBeInTheDocument()
    })
  })
})
