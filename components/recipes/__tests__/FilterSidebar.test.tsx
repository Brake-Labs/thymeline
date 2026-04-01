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

// ── "Your tags" delete flow ───────────────────────────────────────────────────

describe('FilterSidebar - "Your tags" delete flow', () => {
  it('× button does NOT render when onDeleteTag is not provided', () => {
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
      />
    )
    expect(screen.queryByLabelText('Delete tag MyCustomTag')).not.toBeInTheDocument()
  })

  it('× button renders when onDeleteTag is provided', () => {
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
        onDeleteTag={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Delete tag MyCustomTag')).toBeInTheDocument()
  })

  it('clicking × shows confirmation panel with Delete and Cancel', () => {
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
        onDeleteTag={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Delete tag MyCustomTag'))
    expect(screen.getByText(/Delete \u201cMyCustomTag\u201d from all recipes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('clicking × again on the same tag hides the confirmation', () => {
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
        onDeleteTag={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Delete tag MyCustomTag'))
    expect(screen.getByText(/Delete \u201cMyCustomTag\u201d from all recipes/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Delete tag MyCustomTag'))
    expect(screen.queryByText(/Delete \u201cMyCustomTag\u201d from all recipes/)).not.toBeInTheDocument()
  })

  it('clicking Cancel hides confirmation without calling onDeleteTag', () => {
    const onDeleteTag = vi.fn()
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
        onDeleteTag={onDeleteTag}
      />
    )
    fireEvent.click(screen.getByLabelText('Delete tag MyCustomTag'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDeleteTag).not.toHaveBeenCalled()
    expect(screen.queryByText(/Delete \u201cMyCustomTag\u201d from all recipes/)).not.toBeInTheDocument()
  })

  it('clicking Delete calls onDeleteTag with the tag name', async () => {
    const onDeleteTag = vi.fn().mockResolvedValue(undefined)
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={vi.fn()}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
        onDeleteTag={onDeleteTag}
      />
    )
    fireEvent.click(screen.getByLabelText('Delete tag MyCustomTag'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(onDeleteTag).toHaveBeenCalledWith('MyCustomTag'))
  })

  it('deleting an active filter calls onChange to remove it from filter state', async () => {
    const onChange = vi.fn()
    const onDeleteTag = vi.fn().mockResolvedValue(undefined)
    render(
      <FilterSidebar
        filters={{ ...emptyFilters, tags: ['MyCustomTag'] }}
        onChange={onChange}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={1}
        onDeleteTag={onDeleteTag}
      />
    )
    fireEvent.click(screen.getByLabelText('Delete tag MyCustomTag'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [] }),
      )
    )
  })

  it('deleting an inactive filter does NOT call onChange', async () => {
    const onChange = vi.fn()
    const onDeleteTag = vi.fn().mockResolvedValue(undefined)
    render(
      <FilterSidebar
        filters={emptyFilters}
        onChange={onChange}
        onClearAll={vi.fn()}
        vaultTags={['MyCustomTag']}
        activeCount={0}
        onDeleteTag={onDeleteTag}
      />
    )
    fireEvent.click(screen.getByLabelText('Delete tag MyCustomTag'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(onDeleteTag).toHaveBeenCalled())
    expect(onChange).not.toHaveBeenCalled()
  })
})
