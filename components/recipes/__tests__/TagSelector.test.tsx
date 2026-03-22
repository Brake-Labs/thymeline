// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TagSelector from '../TagSelector'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

// Default: GET /api/tags returns empty custom array; POST creates successfully
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeTagsResponse(custom: { name: string; section: string }[] = []) {
  return Promise.resolve({
    ok: true,
    json: async () => ({
      firstClass: ['Chicken', 'Beef', 'Healthy', 'Quick', 'Soup'],
      custom,
    }),
  })
}

function makeCreateResponse(name: string) {
  return Promise.resolve({
    ok: true,
    json: async () => ({ id: 'new-id', name }),
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  // Default: GET returns empty custom tags
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (!opts?.method || opts.method === 'GET') return makeTagsResponse()
    return makeCreateResponse('NewTag')
  })
})

// ── T07: User can select existing first-class or custom tag ───────────────────

describe('T07 - User can select any existing first-class or custom tag', () => {
  it('renders first-class tags and toggles selection on click', () => {
    const onChange = vi.fn()
    render(<TagSelector selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chicken' }))
    expect(onChange).toHaveBeenCalledWith(['Chicken'])
  })

  it('deselects a tag when clicked while selected', () => {
    const onChange = vi.fn()
    render(<TagSelector selected={['Vegetarian']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vegetarian' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})

// ── T02: suggestedTags appear pre-checked with sparkle ────────────────────────

describe('T02 - suggestedTags appear pre-checked', () => {
  it('selected prop including suggested tag renders chip in selected state', () => {
    render(
      <TagSelector
        selected={['Chicken']}
        suggested={['Chicken']}
        onChange={vi.fn()}
      />,
    )
    const chip = screen.getByRole('button', { name: 'Chicken' })
    // Selected style applied
    expect(chip.className).toContain('bg-stone-800')
  })

  it('sparkle ✦ appears on suggested tag that has not been interacted with', () => {
    render(
      <TagSelector
        selected={['Quick']}
        suggested={['Quick']}
        onChange={vi.fn()}
      />,
    )
    // The sparkle span is inside the chip button
    const chip = screen.getByRole('button', { name: 'Quick' })
    expect(chip.innerHTML).toContain('✦')
  })
})

// ── T06: User can uncheck a suggested tag ─────────────────────────────────────

describe('T06 - User can uncheck a suggested tag', () => {
  it('removes tag from selected and loses sparkle on click', () => {
    const onChange = vi.fn()
    render(
      <TagSelector
        selected={['Chicken']}
        suggested={['Chicken']}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Chicken' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})

// ── T03: suggestedNewTags appear as pending-new chips ─────────────────────────

describe('T03 - pendingNew chips have dashed amber border', () => {
  it('renders pending-new chip with amber styling', () => {
    render(
      <TagSelector
        selected={[]}
        pendingNew={['FancyDish']}
        onChange={vi.fn()}
      />,
    )
    const chip = screen.getByLabelText('Confirm tag FancyDish')
    expect(chip.closest('span')?.className).toContain('border-dashed')
    expect(chip.closest('span')?.className).toContain('amber')
  })
})

// ── T04: Tapping pending-new body creates it and selects ─────────────────────

describe('T04 - Tapping pending-new chip body creates tag and selects it', () => {
  it('calls POST /api/tags and updates selected', async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (!opts?.method || opts.method === 'GET') return makeTagsResponse()
      return makeCreateResponse('FancyDish')
    })

    const onChange = vi.fn()
    render(<TagSelector selected={[]} pendingNew={['FancyDish']} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Confirm tag FancyDish'))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['FancyDish'])
    })
  })
})

// ── T05: Tapping × on pending-new removes without creating ───────────────────

describe('T05 - Tapping × on pending-new chip removes it without creating', () => {
  it('removes chip from pending-new on × click', () => {
    render(<TagSelector selected={[]} pendingNew={['FancyDish']} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Confirm tag FancyDish')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Dismiss FancyDish'))
    expect(screen.queryByLabelText('Confirm tag FancyDish')).not.toBeInTheDocument()
  })

  it('does not call POST /api/tags when × is clicked', () => {
    render(<TagSelector selected={[]} pendingNew={['FancyDish']} onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Dismiss FancyDish'))
    const postCalls = mockFetch.mock.calls.filter(
      ([, opts]) => opts?.method === 'POST',
    )
    expect(postCalls).toHaveLength(0)
  })
})

// ── T08: + chip expands to inline text input ──────────────────────────────────

describe('T08 - + chip expands to inline text input', () => {
  it('+ chips appear in Style, Dietary, Seasonal, Cuisine, and Protein sections', () => {
    render(<TagSelector selected={[]} onChange={vi.fn()} />)
    const chips = screen.getAllByLabelText('Add custom tag')
    expect(chips).toHaveLength(5)
  })

  it('clicking Style + shows a text input', () => {
    render(<TagSelector selected={[]} onChange={vi.fn()} />)
    const [styleChip] = screen.getAllByLabelText('Add custom tag')
    fireEvent.click(styleChip)
    expect(screen.getByPlaceholderText('Tag name')).toBeInTheDocument()
  })

  it('clicking Protein + shows a text input', () => {
    render(<TagSelector selected={[]} onChange={vi.fn()} />)
    const chips = screen.getAllByLabelText('Add custom tag')
    fireEvent.click(chips[4])
    expect(screen.getByPlaceholderText('Tag name')).toBeInTheDocument()
  })

  it('opening Style + shows input there while other + chips stay visible', () => {
    render(<TagSelector selected={[]} onChange={vi.fn()} />)
    const [styleChip] = screen.getAllByLabelText('Add custom tag')
    fireEvent.click(styleChip)
    // Input replaces the Style + chip; Dietary, Seasonal, Cuisine, and Protein + chips stay
    expect(screen.getByPlaceholderText('Tag name')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Add custom tag')).toHaveLength(4)
  })
})

// ── T09: Dedup — typing existing tag selects canonical instead of creating ────

describe('T09 - Typing a name matching an existing tag selects it instead of creating', () => {
  it('selects the canonical first-class tag instead of creating', async () => {
    const onChange = vi.fn()
    render(<TagSelector selected={[]} onChange={onChange} />)

    const [styleChip] = screen.getAllByLabelText('Add custom tag')
    fireEvent.click(styleChip)
    const input = screen.getByPlaceholderText('Tag name')
    fireEvent.change(input, { target: { value: 'chicken' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['Chicken'])
    })
    // No POST call
    const postCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'POST')
    expect(postCalls).toHaveLength(0)
    // Dedup hint shown
    expect(await screen.findByText(/'Chicken' already exists — selected it for you\./)).toBeInTheDocument()
  })
})

// ── T10: Creating new tag via + chip adds it and selects ─────────────────────

describe('T10 - Creating a new tag via + chip adds it to custom_tags and selects it', () => {
  it('calls POST /api/tags, adds to custom section, and selects', async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (!opts?.method || opts.method === 'GET') return makeTagsResponse()
      return makeCreateResponse('BrandNew')
    })

    const onChange = vi.fn()
    render(<TagSelector selected={[]} onChange={onChange} />)

    const [styleChip] = screen.getAllByLabelText('Add custom tag')
    fireEvent.click(styleChip)
    const input = screen.getByPlaceholderText('Tag name')
    fireEvent.change(input, { target: { value: 'BrandNew' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['BrandNew'])
    })
    const postCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'POST')
    expect(postCalls).toHaveLength(1)
  })
})
