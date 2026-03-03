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
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
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
    const sorted = [recipes[1], recipes[2], recipes[0]] // Apple Pie, Bacon Eggs, Zucchini Soup
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
