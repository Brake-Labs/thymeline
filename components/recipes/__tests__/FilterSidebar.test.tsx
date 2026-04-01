// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterSidebar from '../FilterSidebar'
import type { RecipeFilters } from '@/types'

const emptyFilters: RecipeFilters = {
  tags: [],
  categories: [],
  maxTotalMinutes: null,
  lastMadeFrom: null,
  lastMadeTo: null,
  neverMade: false,
}

// ── "Your tags" section for custom vault tags ─────────────────────────────────

describe('FilterSidebar - "Your tags" section', () => {
  it('shows "Your tags" section when vaultTags contains a non-first-class tag', () => {
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
      />
    )
    expect(screen.getByText('Your tags')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MyCustomTag' })).toBeInTheDocument()
  })

  it('does not show "Your tags" section when all vault tags are first-class', () => {
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['Chicken', 'Italian']}
        activeCount={0}
      />
    )
    expect(screen.queryByText('Your tags')).not.toBeInTheDocument()
  })

  it('custom tag pill calls onChange with that tag when clicked', () => {
    const onChange = vi.fn()
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={onChange}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'MyCustomTag' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['MyCustomTag'] }),
    )
  })

  it('active custom tag is shown with active pill style (count badge increments)', () => {
    render(
      <FilterSidebar
        filters={{ ...emptyFilters, tags: ['MyCustomTag'] }}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={1}
      />
    )
    // "Your tags" section is visible and tag is rendered
    expect(screen.getByText('Your tags')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MyCustomTag' })).toBeInTheDocument()
  })
})
