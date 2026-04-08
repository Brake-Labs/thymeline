// @vitest-environment jsdom
/**
 * Tests for GotItSection — "Add to pantry" functionality.
 * Covers spec-12 test case: T19
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

afterEach(() => cleanup())


const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import GotItSection from '../GotItSection'

const sampleItems = [
  {
    id: 'i1', name: 'chicken breast', amount: 1, unit: 'lb',
    section: 'Proteins' as const, isPantry: false, checked: true, bought: true, recipes: ['Soup'],
  },
  {
    id: 'i2', name: 'spinach', amount: null, unit: null,
    section: 'Produce' as const, isPantry: false, checked: true, bought: true, recipes: ['Soup'],
  },
]

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ imported: 1, updated: 0 }),
  })
})

// ── T19: "Add to pantry" from Got It section calls POST /api/pantry/import ────

describe('T19 - Add to pantry from Got It section calls POST /api/pantry/import', () => {
  it('renders "Add all to pantry" button when items exist', async () => {
    render(<GotItSection items={sampleItems} onUndo={vi.fn()} />)

    // Expand the section (it starts collapsed if > 3 items, but we have 2 → expanded)
    // The section has 2 items so collapsed=false initially
    await waitFor(() => {
      const addAllBtn = screen.queryByText(/add all to pantry/i)
      expect(addAllBtn).not.toBeNull()
    })
  })

  it('clicking "Add to pantry" on a single item calls import with that item', async () => {
    render(<GotItSection items={sampleItems} onUndo={vi.fn()} />)

    await waitFor(() => {
      const addBtns = screen.getAllByLabelText(/add .* to pantry/i)
      expect(addBtns.length).toBeGreaterThan(0)
    })

    const addBtn = screen.getAllByLabelText(/add .* to pantry/i)[0]!
    fireEvent.click(addBtn)

    await waitFor(() => {
      const importCalls = mockFetch.mock.calls.filter(
        ([url]) => url === '/api/pantry/import',
      )
      expect(importCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(importCalls[0]![1].body as string)
      expect(Array.isArray(body.items)).toBe(true)
      expect(body.items[0].name).toBe('chicken breast')
    })
  })

  it('clicking "Add all to pantry" calls import with all items', async () => {
    render(<GotItSection items={sampleItems} onUndo={vi.fn()} />)

    await waitFor(() => {
      const addAllBtn = screen.queryByText(/add all to pantry/i)
      expect(addAllBtn).not.toBeNull()
    })

    fireEvent.click(screen.getByText(/add all to pantry/i))

    await waitFor(() => {
      const importCalls = mockFetch.mock.calls.filter(
        ([url]) => url === '/api/pantry/import',
      )
      expect(importCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(importCalls[0]![1].body as string)
      expect(body.items).toHaveLength(2)
    })
  })

  it('shows a brief success toast after adding', async () => {
    render(<GotItSection items={sampleItems} onUndo={vi.fn()} />)

    await waitFor(() => {
      const addBtns = screen.getAllByLabelText(/add .* to pantry/i)
      expect(addBtns.length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByLabelText(/add .* to pantry/i)[0]!)

    await waitFor(() => {
      const toast = screen.queryByText(/added to pantry/i)
      expect(toast).not.toBeNull()
    })
  })
})
