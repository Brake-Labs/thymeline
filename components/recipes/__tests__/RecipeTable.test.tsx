// @vitest-environment jsdom
/**
 * Tests for RecipeTable sorting and display.
 * Covers spec test cases: T04 (tag display), T14 (sort correctness)
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RecipeTable from '../RecipeTable'
import { RecipeListItem } from '@/types'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

const baseRecipe: RecipeListItem = {
  id: '1',
  user_id: 'u1',
  title: 'Pasta',
  category: 'main_dish',
  tags: [],
  is_shared: false,
  last_made: null,
  times_made: 0,
  created_at: '2026-01-01T00:00:00Z',
  total_time_minutes: null,
}

const recipes: RecipeListItem[] = [
  { ...baseRecipe, id: '1', title: 'Zucchini Soup', category: 'side_dish', last_made: '2026-01-10', tags: ['Healthy', 'Quick', 'Vegetarian', 'Soup'] },
  { ...baseRecipe, id: '2', title: 'Apple Pie', category: 'dessert', last_made: '2026-01-05', tags: ['Favorite'] },
  { ...baseRecipe, id: '3', title: 'Bacon Eggs', category: 'breakfast', last_made: null, tags: [] },
]

describe('RecipeTable', () => {
  it('T04: shows "Never" for last_made = null', () => {
    render(
      <RecipeTable
        recipes={recipes}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
      />
    )
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('T04: shows category label, not enum value', () => {
    render(
      <RecipeTable
        recipes={recipes}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
      />
    )
    // Test data has side_dish, dessert, breakfast — verify labels not raw enum values
    expect(screen.getByText('Side Dish')).toBeInTheDocument()
    expect(screen.getByText('Dessert')).toBeInTheDocument()
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
    // Raw enum values must NOT appear
    expect(screen.queryByText('side_dish')).not.toBeInTheDocument()
    expect(screen.queryByText('main_dish')).not.toBeInTheDocument()
  })

  it('T04: shows max 3 tag pills + "+N more" for recipes with >3 tags', () => {
    render(
      <RecipeTable
        recipes={recipes}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
      />
    )
    // Zucchini Soup has 4 tags; should show 3 pills and "+1 more"
    expect(screen.getByText('+1 more')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('Quick')).toBeInTheDocument()
    expect(screen.getByText('Vegetarian')).toBeInTheDocument()
    // 4th tag "Soup" should not appear as a pill
    const pillTexts = screen.queryAllByText('Soup')
    expect(pillTexts).toHaveLength(0)
  })

  it('T14: clicking Name header calls onSort with "title"', () => {
    const onSort = vi.fn()
    render(
      <RecipeTable
        recipes={recipes}
        sortKey="title"
        sortDir="asc"
        onSort={onSort}
      />
    )
    fireEvent.click(screen.getByText(/Name/))
    expect(onSort).toHaveBeenCalledWith('title')
  })

  it('T14: clicking Category header calls onSort with "category"', () => {
    const onSort = vi.fn()
    render(
      <RecipeTable
        recipes={recipes}
        sortKey="title"
        sortDir="asc"
        onSort={onSort}
      />
    )
    fireEvent.click(screen.getByText(/Category/))
    expect(onSort).toHaveBeenCalledWith('category')
  })

  it('T14: clicking Last Made header calls onSort with "last_made"', () => {
    const onSort = vi.fn()
    render(
      <RecipeTable
        recipes={recipes}
        sortKey="title"
        sortDir="asc"
        onSort={onSort}
      />
    )
    fireEvent.click(screen.getByText(/Last Made/))
    expect(onSort).toHaveBeenCalledWith('last_made')
  })

  it('T14: recipes render in the order they are passed (sort is caller responsibility)', () => {
    const sorted = [recipes[1]!, recipes[2]!, recipes[0]!] // Apple Pie, Bacon Eggs, Zucchini Soup
    render(
      <RecipeTable
        recipes={sorted}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
      />
    )
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('Apple Pie')
    expect(rows[1]).toHaveTextContent('Bacon Eggs')
    expect(rows[2]).toHaveTextContent('Zucchini Soup')
  })
})

// ── Owner actions (Edit / Delete per row) ─────────────────────────────────────

const ownedRecipes: RecipeListItem[] = [
  { ...baseRecipe, id: 'r1', user_id: 'me', title: 'My Pasta' },
  { ...baseRecipe, id: 'r2', user_id: 'other', title: 'Their Soup' },
]

describe('RecipeTable — owner actions', () => {
  it('renders Edit link and Delete button only for owned rows', () => {
    render(
      <RecipeTable
        recipes={ownedRecipes}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
        currentUserId="me"
      />,
    )
    // Own recipe row has Edit link to /recipes/r1/edit
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/recipes/r1/edit')
    // Own recipe row has Delete button
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('does not render Edit/Delete for recipes owned by another user', () => {
    render(
      <RecipeTable
        recipes={ownedRecipes}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
        currentUserId="me"
      />,
    )
    // Only one Edit link (for "me"'s recipe), not for "other"'s recipe
    expect(screen.getAllByRole('link', { name: 'Edit' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
  })

  it('renders no actions column when currentUserId is not provided', () => {
    render(
      <RecipeTable
        recipes={ownedRecipes}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
      />,
    )
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
  })

  it('Edit link uses aria-label (icon button, no visible text)', () => {
    render(
      <RecipeTable
        recipes={ownedRecipes}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
        currentUserId="me"
      />,
    )
    const editLink = screen.getByRole('link', { name: 'Edit' })
    expect(editLink).toHaveAttribute('aria-label', 'Edit')
    expect(editLink).toHaveAttribute('href', '/recipes/r1/edit')
  })

  it('Delete button uses aria-label (icon button, no visible text)', () => {
    render(
      <RecipeTable
        recipes={ownedRecipes}
        sortKey="title"
        sortDir="asc"
        onSort={vi.fn()}
        currentUserId="me"
      />,
    )
    const deleteBtn = screen.getByRole('button', { name: 'Delete' })
    expect(deleteBtn).toHaveAttribute('aria-label', 'Delete')
  })
})
