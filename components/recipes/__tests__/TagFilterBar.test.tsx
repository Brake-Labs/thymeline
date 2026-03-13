// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TagFilterBar from '../TagFilterBar'

// ── T23: Tag filter bar hidden when no tags ───────────────────────────────────

describe('T23 - Tag filter bar is hidden when vault has no tagged recipes', () => {
  it('renders nothing when tags array is empty', () => {
    const { container } = render(
      <TagFilterBar tags={[]} activeFilters={[]} onChange={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

// ── T22: Tag filter bar shows tags from recipes ───────────────────────────────

describe('T22 - Tag filter bar shows only tags present on at least one recipe', () => {
  it('renders tag buttons for provided tags', () => {
    render(
      <TagFilterBar tags={['Chicken', 'Healthy']} activeFilters={[]} onChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Chicken' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Healthy' })).toBeInTheDocument()
  })
})

// ── T24: Selecting a tag filters the recipe list ─────────────────────────────

describe('T24 - Selecting a tag calls onChange with that tag', () => {
  it('adds tag to active filters when clicked', () => {
    const onChange = vi.fn()
    render(
      <TagFilterBar tags={['Chicken', 'Healthy']} activeFilters={[]} onChange={onChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Chicken' }))
    expect(onChange).toHaveBeenCalledWith(['Chicken'])
  })

  it('removes tag when already-active tag is clicked', () => {
    const onChange = vi.fn()
    render(
      <TagFilterBar tags={['Chicken', 'Healthy']} activeFilters={['Chicken']} onChange={onChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Chicken' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})

// ── T25: Multiple tags use AND logic ─────────────────────────────────────────

describe('T25 - Selecting multiple tags accumulates them (AND logic in parent)', () => {
  it('adds second tag to existing active filters', () => {
    const onChange = vi.fn()
    render(
      <TagFilterBar
        tags={['Chicken', 'Healthy', 'Quick']}
        activeFilters={['Chicken']}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Healthy' }))
    expect(onChange).toHaveBeenCalledWith(['Chicken', 'Healthy'])
  })
})

// ── T26: Clear button resets filters ─────────────────────────────────────────

describe('T26 - "Clear" button resets all active filters', () => {
  it('shows Clear button when filters are active', () => {
    render(
      <TagFilterBar
        tags={['Chicken']}
        activeFilters={['Chicken']}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('does not show Clear button when no filters active', () => {
    render(
      <TagFilterBar tags={['Chicken']} activeFilters={[]} onChange={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('calls onChange([]) when Clear is clicked', () => {
    const onChange = vi.fn()
    render(
      <TagFilterBar
        tags={['Chicken']}
        activeFilters={['Chicken']}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
