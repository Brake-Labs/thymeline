// @vitest-environment jsdom
/**
 * Tests for GenerateRecipeTab component.
 * Covers spec-13 test cases: T02, T04, T25
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GenerateRecipeTab from '../GenerateRecipeTab'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSelect,
        }),
      }),
    }),
  }),
}))

// ── Fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  getToken: async () => 'test-token',
  onGenerated: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockSelect.mockResolvedValue({ data: { avoided_tags: [] }, error: null })
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({}),
  } as Response)
})

// ── T02: Generate button disabled when ingredients empty ──────────────────────

describe('T02 - Generate button disabled when ingredients empty', () => {
  it('is disabled on initial render with no ingredients', async () => {
    render(<GenerateRecipeTab {...defaultProps} />)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /generate recipe/i })
      expect(btn).toBeDisabled()
    })
  })
})

// ── T04: Generate button enabled when specificIngredients is non-empty ─────────

describe('T04 - Generate button enabled when specificIngredients is non-empty', () => {
  it('becomes enabled when user types in the ingredients textarea', async () => {
    render(<GenerateRecipeTab {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/e.g. chicken breast/i)
    fireEvent.change(textarea, { target: { value: 'chicken breast' } })
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /generate recipe/i })
      expect(btn).not.toBeDisabled()
    })
  })

  it('is enabled when initialIngredients is non-empty', async () => {
    render(<GenerateRecipeTab {...defaultProps} initialIngredients="salmon" />)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /generate recipe/i })
      expect(btn).not.toBeDisabled()
    })
  })
})

// ── T25: Dietary restrictions pre-populated from avoided_tags ─────────────────

describe('T25 - Dietary restrictions from avoided_tags ∩ DIETARY_TAGS are pre-checked', () => {
  it('pre-checks dietary tags that match the user avoided_tags', async () => {
    mockSelect.mockResolvedValue({
      data: { avoided_tags: ['Gluten-Free', 'Vegan', 'Quick'] },
      error: null,
    })
    render(<GenerateRecipeTab {...defaultProps} />)

    await waitFor(() => {
      const glutenFreeBtn = screen.getByRole('button', { name: 'Gluten-Free' })
      expect(glutenFreeBtn.className).toContain('bg-stone-800')
    })
    await waitFor(() => {
      const veganBtn = screen.getByRole('button', { name: 'Vegan' })
      expect(veganBtn.className).toContain('bg-stone-800')
    })
  })

  it('does NOT pre-check non-dietary avoided_tags (like "Quick")', async () => {
    mockSelect.mockResolvedValue({
      data: { avoided_tags: ['Quick', 'Vegan'] },
      error: null,
    })
    render(<GenerateRecipeTab {...defaultProps} />)

    // Quick is not in DIETARY_TAGS so it won't appear as a dietary button
    await waitFor(() => {
      const veganBtn = screen.getByRole('button', { name: 'Vegan' })
      expect(veganBtn.className).toContain('bg-stone-800')
    })
    // Quick is a style tag, not shown in dietary section — just verify Vegan is selected
    const allButtons = screen.getAllByRole('button')
    const quickBtn = allButtons.find((b) => b.textContent === 'Quick')
    // Quick shouldn't be in the dietary section at all
    expect(quickBtn).toBeUndefined()
  })

  it('leaves all dietary tags unchecked when avoided_tags is empty', async () => {
    mockSelect.mockResolvedValue({ data: { avoided_tags: [] }, error: null })
    render(<GenerateRecipeTab {...defaultProps} />)

    await waitFor(() => {
      const glutenFreeBtn = screen.getByRole('button', { name: 'Gluten-Free' })
      expect(glutenFreeBtn.className).not.toContain('bg-stone-800')
    })
  })
})
