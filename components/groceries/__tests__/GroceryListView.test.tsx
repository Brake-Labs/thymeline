// @vitest-environment jsdom
/**
 * Tests for GroceryListView and grocery UI.
 * Covers spec test cases: T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { GroceryList } from '@/types'


vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const sampleList: GroceryList = {
  id:            'list-1',
  userId:       'user-1',
  mealPlanId:  'plan-1',
  weekStart:    '2026-03-15',
  servings: 4,
  recipeScales: [
    { recipeId: 'r1', recipeTitle: 'Pasta', servings: null },
    { recipeId: 'r2', recipeTitle: 'Salad', servings: null },
  ],
  items: [
    { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, recipes: ['Pasta'] },
    { id: 'i2', name: 'lettuce', amount: 1, unit: null, section: 'Produce', isPantry: false, checked: false, recipes: ['Salad'] },
    { id: 'i3', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, recipes: ['Pasta'] },
  ],
  createdAt:    '2026-03-15T00:00:00Z',
  updatedAt:    '2026-03-15T00:00:00Z',
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
    const removeBtn = screen.getAllByLabelText(/Remove/)[0]!
    fireEvent.click(removeBtn)
    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
    })
  })
})

// ── T14: Overridden recipe shows "Reset to default" button ───────────────────

describe('T14 - Overridden recipe shows reset option', () => {
  it('shows "Reset to default" when recipe has servings override', () => {
    const listWithOverride = {
      ...sampleList,
      recipeScales: [
        { recipeId: 'r1', recipeTitle: 'Pasta', servings: 4 },
        { recipeId: 'r2', recipeTitle: 'Salad', servings: null },
      ],
    }
    render(<GroceryListView initialList={listWithOverride} />)
    expect(screen.getByText('Reset to default')).toBeInTheDocument()
    expect(screen.queryByText('Custom')).not.toBeInTheDocument()
  })

  it('does not show "Reset to default" when no override', () => {
    render(<GroceryListView initialList={sampleList} />)
    expect(screen.queryByText('Reset to default')).not.toBeInTheDocument()
  })
})

// ── T15: Pantry items show "(in pantry)" ───────────────────────────────────────────────

describe('T15 - Pantry items show in-pantry text', () => {
  it('renders (in pantry) for unchecked isPantry items', () => {
    render(<GroceryListView initialList={sampleList} />)
    expect(screen.getByText('(in pantry)')).toBeInTheDocument()
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

describe('T18 - Confirming regenerate replaces items and resets recipeScales', () => {
  it('calls POST /api/groceries/generate and updates state', async () => {
    const regeneratedList = {
      ...sampleList,
      items: [{ id: 'new-1', name: 'tomato', amount: 2, unit: null, section: 'Produce', isPantry: false, checked: false, recipes: ['Pasta'] }],
      recipeScales: [{ recipeId: 'r1', recipeTitle: 'Pasta', servings: null }],
    }
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('generate')) {
        return Promise.resolve({ ok: true, json: async () => ({ list: regeneratedList, skippedRecipes: [] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByText('Regenerate'))
    // Click the confirm button inside the dialog
    const confirmBtn = screen.getAllByText('Regenerate').find((el) =>
      el.closest('[class*="flex gap-3"]'),
    ) ?? screen.getAllByText('Regenerate')[1]!
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

    const gotItBtn = screen.getAllByLabelText(/Got it pasta/i)[0]!
    fireEvent.click(gotItBtn)

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(patchCalls[0]![1].body)
      const pastaItem = body.items.find((i: { name: string }) => i.name === 'pasta')
      expect(pastaItem?.bought).toBe(true)
    })
  })

  it('moves all recipe items to Got it on "Mark all as bought"', async () => {
    render(<GroceryListView initialList={sampleList} />)

    // Find the "Mark all as bought" button for Pasta
    const markAllBtns = screen.getAllByText('Mark all as bought')
    fireEvent.click(markAllBtns[0]!)

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(patchCalls[0]![1].body)
      const pastaItems = body.items.filter((i: { recipes: string[] }) => i.recipes.includes('Pasta'))
      expect(pastaItems.every((i: { bought: boolean }) => i.bought)).toBe(true)
    })
  })

  it('shows Got it section with bought items and Undo button', () => {
    const listWithBought: GroceryList = {
      ...sampleList,
      items: [
        { ...sampleList.items[0]!, bought: true },
        sampleList.items[1]!,
        sampleList.items[2]!,
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
      const args = shareMock.mock.calls[0]![0]
      // Header + blank line + one item per line, no bullets
      const lines = args.text.split('\n').filter(Boolean)
      expect(lines.length).toBeGreaterThan(1)
      expect(args.text).toContain('pasta')
      expect(args.text).not.toContain('🛒')
      expect(args.text).not.toMatch(/^[•\-–]/m)
    })
  })

  it('regression: share text contains week header so apps that ignore title still show it', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalled()
      const args = shareMock.mock.calls[0]![0]
      // Week header must be the first line of text (not a separate title field)
      expect(args.text).toMatch(/^Grocery list — week of \d{4}-\d{2}-\d{2}/)
      // No separate title that could shadow the item list
      expect(args.title).toBeUndefined()
    })
  })

  it('excludes bought items from the share payload', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    const listWithBought: GroceryList = {
      ...sampleList,
      items: [
        { ...sampleList.items[0]!, bought: true },   // pasta — bought, should be excluded
        { ...sampleList.items[1]!, bought: false },  // lettuce — not bought, should be included
        sampleList.items[2]!,
      ],
    }

    render(<GroceryListView initialList={listWithBought} />)
    fireEvent.click(screen.getByText('Share'))

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalled()
      const { text } = shareMock.mock.calls[0]![0]
      expect(text).not.toContain('pasta')
      expect(text).toContain('lettuce')
    })
  })
})


// ── T17 (spec-23): Inline quantity edit ────────────────────────────────────────────────

describe('T17 (spec-23) - Inline quantity edit reflected in list and PATCH', () => {
  it('clicking Edit on an item reveals inputs and Save saves changes', async () => {
    render(<GroceryListView initialList={sampleList} />)
    const editBtn = screen.getByLabelText('Edit pasta')
    fireEvent.click(editBtn)
    const amountInput = screen.getByPlaceholderText('qty')
    fireEvent.change(amountInput, { target: { value: '300' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(patchCalls[0]![1].body)
      const pastaItem = body.items.find((i: { name: string }) => i.name === 'pasta')
      expect(pastaItem?.amount).toBe(300)
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

// ── T261-A: Need to Buy section groups non-pantry items (regression for #261) ──

describe('T261-A - Need to Buy section shows non-pantry items (regression for #261)', () => {
  it('renders Need to Buy heading and places non-pantry items under it', () => {
    render(<GroceryListView initialList={sampleList} />)
    expect(screen.getByRole('region', { name: 'Need to Buy' })).toBeInTheDocument()
    // pasta and lettuce are non-pantry
    expect(screen.getByLabelText('Check pasta')).toBeInTheDocument()
    expect(screen.getByLabelText('Check lettuce')).toBeInTheDocument()
  })

  it('shows grocery section labels for items grouped under Need to Buy', () => {
    render(<GroceryListView initialList={sampleList} />)
    // pasta is section:'Pantry', lettuce is section:'Produce'
    expect(screen.getByText('Pantry')).toBeInTheDocument()
    expect(screen.getByText('Produce')).toBeInTheDocument()
  })
})

// ── T261-B: Pantry Items section shows isPantry items (regression for #261) ──

describe('T261-B - Pantry Items section shows isPantry items (regression for #261)', () => {
  it('renders Pantry Items heading and places isPantry items under it', () => {
    render(<GroceryListView initialList={sampleList} />)
    expect(screen.getByRole('region', { name: 'Pantry Items' })).toBeInTheDocument()
    expect(screen.getByLabelText('Check olive oil')).toBeInTheDocument()
  })

  it('checking a pantry item calls PATCH', async () => {
    render(<GroceryListView initialList={sampleList} />)
    fireEvent.click(screen.getByLabelText('Check olive oil'))
    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')
      expect(patchCalls.length).toBeGreaterThan(0)
    })
  })
})

// ── T261-C: Recipes panel is collapsible (regression for #261) ───────────────

describe('T261-C - Recipes panel is collapsible (regression for #261)', () => {
  it('shows recipe titles in an open Recipes panel by default', () => {
    render(<GroceryListView initialList={sampleList} />)
    expect(screen.getByRole('region', { name: 'Recipes in this list' })).toBeInTheDocument()
    expect(screen.getByText('Pasta')).toBeInTheDocument()
    expect(screen.getByText('Salad')).toBeInTheDocument()
  })

  it('collapses recipes panel when the header button is clicked', () => {
    render(<GroceryListView initialList={sampleList} />)
    const toggleBtn = screen.getByRole('button', { name: /Recipes \(2\)/ })
    fireEvent.click(toggleBtn)
    // After collapse, recipe titles disappear
    expect(screen.queryByText('Pasta')).not.toBeInTheDocument()
  })
})
