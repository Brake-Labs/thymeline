// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import TagLibrarySection from '../TagLibrarySection'

const mockFetch = vi.fn()
global.fetch = mockFetch

const sampleFirstClass = [
  { name: 'Quick', recipeCount: 12 },
  { name: 'Gluten-Free', recipeCount: 4 },
]
const sampleCustom = [
  { name: 'Weeknight', section: 'style', recipeCount: 8 },
  { name: 'Date Night', section: 'style', recipeCount: 2 },
]
const sampleHidden = [{ name: 'Keto' }]

beforeEach(() => {
  mockFetch.mockClear()
  mockFetch.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) })
})

// ── Spec-19 T1: Counts displayed ─────────────────────────────────────────────

describe('Spec-19 T1 - tag library loads with recipe counts', () => {
  it('shows recipe counts for built-in and custom tags', async () => {
    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={sampleFirstClass}
          customTags={sampleCustom}
          hiddenTags={[]}
        />
      )
    })
    expect(screen.getByText('12 recipes')).toBeDefined()
    expect(screen.getByText('4 recipes')).toBeDefined()
    expect(screen.getByText('8 recipes')).toBeDefined()
    expect(screen.getByText('2 recipes')).toBeDefined()
  })
})

// ── Spec-19 T2: Hidden tags in Hidden section ─────────────────────────────────

describe('Spec-19 T2 - hidden tags appear in Hidden section', () => {
  it('shows hidden tag in Hidden section and not in Built-in', async () => {
    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={sampleFirstClass}
          customTags={[]}
          hiddenTags={sampleHidden}
        />
      )
    })
    // Keto should appear under Hidden
    const allKeto = screen.getAllByText('Keto')
    expect(allKeto.length).toBeGreaterThan(0)
    // Built-in section should NOT show Keto
    expect(screen.getByText('Hidden tags')).toBeDefined()
    // Quick should appear under Built-in, not hidden
    expect(screen.queryByText('Quick')).toBeDefined()
  })

  it('does not show Hidden section when no tags are hidden', async () => {
    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={sampleFirstClass}
          customTags={[]}
          hiddenTags={[]}
        />
      )
    })
    expect(screen.queryByText('Hidden tags')).toBeNull()
  })
})

// ── Spec-19 T3: Adding a new tag ──────────────────────────────────────────────

describe('Spec-19 T3 - adding a new tag appends to Your tags', () => {
  it('calls POST /api/tags and adds the tag to the list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ name: 'FridayNight', section: 'style' }),
    })

    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={[]}
          customTags={[]}
          hiddenTags={[]}
        />
      )
    })

    const input = screen.getByPlaceholderText('Add a tag…')
    fireEvent.change(input, { target: { value: 'FridayNight' } })
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => expect(screen.queryByText('FridayNight')).toBeDefined())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tags',
      expect.objectContaining({ method: 'POST' })
    )
  })
})

// ── Spec-19 T4: Duplicate name rejected ──────────────────────────────────────

describe('Spec-19 T4 - adding duplicate name shows error and does not create', () => {
  it('shows error without calling API when name already exists', async () => {
    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={sampleFirstClass}
          customTags={sampleCustom}
          hiddenTags={[]}
        />
      )
    })

    const input = screen.getByPlaceholderText('Add a tag…')
    fireEvent.change(input, { target: { value: 'quick' } })  // case-insensitive duplicate of Quick
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() =>
      expect(screen.getByText('A tag with that name already exists.')).toBeDefined()
    )
    // No API call made
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ── Spec-19 T5: Rename updates in place ──────────────────────────────────────

describe('Spec-19 T5 - renaming a custom tag updates in place', () => {
  it('shows rename input and calls PATCH on save', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ name: 'Girls Night', section: 'style' }),
    })

    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={[]}
          customTags={[{ name: 'Date Night', section: 'style', recipeCount: 2 }]}
          hiddenTags={[]}
        />
      )
    })

    fireEvent.click(screen.getByText('Rename'))

    const input = screen.getByDisplayValue('Date Night')
    fireEvent.change(input, { target: { value: 'Girls Night' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.queryByText('Girls Night')).toBeDefined())
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/tags/${encodeURIComponent('Date Night')}`,
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})

// ── Spec-19 T6: Rename to duplicate rejected ─────────────────────────────────

describe('Spec-19 T6 - renaming to an already-existing name is rejected', () => {
  it('shows error when new name matches an existing custom tag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "A tag named 'Weeknight' already exists." }),
    })

    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={[]}
          customTags={[
            { name: 'Date Night', section: 'style', recipeCount: 2 },
            { name: 'Weeknight', section: 'style', recipeCount: 8 },
          ]}
          hiddenTags={[]}
        />
      )
    })

    const renameButtons = screen.getAllByText('Rename')
    fireEvent.click(renameButtons[0]!)
    const input = screen.getByDisplayValue('Date Night')
    fireEvent.change(input, { target: { value: 'Weeknight' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() =>
      expect(screen.getByText("A tag named 'Weeknight' already exists.")).toBeDefined()
    )
    // Old name still present (no rename applied)
    expect(screen.queryByText('Date Night')).toBeDefined()
  })
})

// ── Spec-19 T7: Rename to first-class tag name rejected ───────────────────────

describe('Spec-19 T7 - renaming to a first-class tag name is rejected', () => {
  it('shows error when new name matches a built-in tag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "'Quick' is a built-in tag name and cannot be used for a custom tag." }),
    })

    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={[{ name: 'Quick', recipeCount: 5 }]}
          customTags={[{ name: 'Date Night', section: 'style', recipeCount: 2 }]}
          hiddenTags={[]}
        />
      )
    })

    fireEvent.click(screen.getByText('Rename'))
    const input = screen.getByDisplayValue('Date Night')
    fireEvent.change(input, { target: { value: 'Quick' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() =>
      expect(screen.getByText("'Quick' is a built-in tag name and cannot be used for a custom tag.")).toBeDefined()
    )
    expect(screen.queryByText('Date Night')).toBeDefined()
  })
})

// ── Spec-19 T8: Delete confirmation shows correct count ───────────────────────

describe('Spec-19 T8 - delete confirmation shows recipe count', () => {
  it('shows recipe count in delete confirmation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'Weeknight', recipeCount: 8 }),
    })

    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={[]}
          customTags={[{ name: 'Weeknight', section: 'style', recipeCount: 8 }]}
          hiddenTags={[]}
        />
      )
    })

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() =>
      expect(screen.getByText(/8 recipes/)).toBeDefined()
    )
  })
})

// ── Spec-19 T9: Deleting removes tag ────────────────────────────────────────

describe('Spec-19 T9 - deleting a custom tag removes it from the list', () => {
  it('removes tag after confirmed delete', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Weeknight', recipeCount: 0 }) })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })

    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={[]}
          customTags={[{ name: 'Weeknight', section: 'style', recipeCount: 0 }]}
          hiddenTags={[]}
        />
      )
    })

    fireEvent.click(screen.getByText('Delete'))

    // Wait for the confirmation panel to appear (two Delete buttons: trigger + confirm)
    await waitFor(() => expect(screen.getAllByText('Delete').length).toBeGreaterThanOrEqual(2))

    // Click the confirm Delete button (last one in DOM)
    const deleteButtons = screen.getAllByText('Delete')
    await act(async () => { fireEvent.click(deleteButtons[deleteButtons.length - 1]!) })

    await waitFor(() => expect(screen.queryByText('Weeknight')).toBeNull())
  })
})

// ── Spec-19 T10: Hide first-class tag ────────────────────────────────────────

describe('Spec-19 T10 - hiding a first-class tag moves it to Hidden', () => {
  it('moves tag from Built-in to Hidden on optimistic update', async () => {
    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={[{ name: 'Keto', recipeCount: 0 }]}
          customTags={[]}
          hiddenTags={[]}
        />
      )
    })

    fireEvent.click(screen.getByText('Hide'))

    await waitFor(() => expect(screen.getByText('Hidden tags')).toBeDefined())
    expect(screen.queryByText('Built-in tags')).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/tags/${encodeURIComponent('Keto')}`,
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})

// ── Spec-19 T11: Restore hidden tag ──────────────────────────────────────────

describe('Spec-19 T11 - restoring a hidden tag moves it back to Built-in', () => {
  it('moves Keto from Hidden to Built-in on restore', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ hiddenTags: ['Keto'] }) }) // GET /api/preferences
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })                         // PATCH /api/preferences

    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={[]}
          customTags={[]}
          hiddenTags={[{ name: 'Keto' }]}
        />
      )
    })

    fireEvent.click(screen.getByText('Restore'))

    await waitFor(() => expect(screen.queryByText('Hidden tags')).toBeNull())
    expect(screen.queryByText('Keto')).toBeDefined()
  })
})

// ── Spec-19 T12: Member read-only ────────────────────────────────────────────

describe('Spec-19 T12 - member role: Hide, Rename, Delete absent', () => {
  it('hides Hide, Rename, Delete, and Add when readOnly is true', async () => {
    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={sampleFirstClass}
          customTags={sampleCustom}
          hiddenTags={[]}
          readOnly={true}
        />
      )
    })
    expect(screen.queryByText('Hide')).toBeNull()
    expect(screen.queryByText('Rename')).toBeNull()
    expect(screen.queryByText('Delete')).toBeNull()
    expect(screen.queryByPlaceholderText('Add a tag…')).toBeNull()
  })

  it('shows action buttons when readOnly is false (default)', async () => {
    await act(async () => {
      render(
        <TagLibrarySection
          firstClassTags={sampleFirstClass}
          customTags={sampleCustom}
          hiddenTags={[]}
        />
      )
    })
    expect(screen.getAllByText('Hide').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rename').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText('Add a tag…')).toBeDefined()
  })
})
