// @vitest-environment jsdom
/**
 * Tests for GenerateRecipeChatPanel component.
 * Covers spec-25 test cases: T02, T03, T04, T09, T10, T11, T12, T13, T14, T16, T17, T18, T24, T25, T26, T27
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import GenerateRecipeChatPanel from '../GenerateRecipeChatPanel'
import type { GeneratedRecipe } from '@/types'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const INITIAL_RECIPE: GeneratedRecipe = {
  title:                 'Creamy Pasta',
  ingredients:           'pasta\nheavy cream\ngarlic',
  steps:                 'Cook pasta\nMix with cream\nServe',
  tags:                  ['Quick'],
  category:              'main_dish',
  servings:              4,
  prep_time_minutes:     10,
  cook_time_minutes:     20,
  total_time_minutes:    30,
  inactive_time_minutes: null,
  notes:                 null,
}

const GENERATION_CONTEXT = {
  meal_type:            'dinner',
  style_hints:          'Italian',
  dietary_restrictions: [],
}

const MOCK_REFINE_RESPONSE = {
  message: 'I swapped heavy cream for coconut milk.',
  changes: ['Replaced heavy cream with coconut milk'],
  recipe: {
    title:                 'Dairy-Free Pasta',
    ingredients:           'pasta\ncoconut milk\ngarlic',
    steps:                 'Cook pasta\nMix with coconut milk\nServe',
    tags:                  ['Quick'],
    category:              'main_dish',
    servings:              4,
    prep_time_minutes:     10,
    cook_time_minutes:     20,
    total_time_minutes:    30,
    inactive_time_minutes: null,
    notes:                 null,
  },
}

function makeSuccessResponse() {
  return Promise.resolve({
    ok: true,
    json: async () => MOCK_REFINE_RESPONSE,
  })
}

function makeErrorResponse() {
  return Promise.resolve({
    ok: false,
    status: 500,
    json: async () => ({ error: 'AI service error' }),
  })
}

const defaultProps = {
  initialRecipe:     INITIAL_RECIPE,
  generationContext: GENERATION_CONTEXT,
  onUseRecipe:       vi.fn(),
  onStartOver:       vi.fn(),
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.clearAllMocks()
})

// ── T02: Renders initial recipe title and ingredient/step counts ──────────────

describe('T02 - Renders initial recipe title and ingredient/step counts', () => {
  it('shows recipe title', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    expect(screen.getByText('Creamy Pasta')).toBeInTheDocument()
  })

  it('shows ingredient count', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    expect(screen.getByText(/3 ingredients/i)).toBeInTheDocument()
  })

  it('shows step count', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    expect(screen.getByText(/3 steps/i)).toBeInTheDocument()
  })

  it('shows total time when available', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    expect(screen.getByText(/30 min total/i)).toBeInTheDocument()
  })
})

// ── T03: Empty state prompt shown before first message ───────────────────────

describe('T03 - Empty state prompt shown before first message', () => {
  it('shows empty state text before any messages', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    expect(screen.getByText(/Not quite right\?/i)).toBeInTheDocument()
  })
})

// ── T04: Sending a message calls POST /api/recipes/generate/refine ─────────────

describe('T04 - Sending a message calls POST /api/recipes/generate/refine', () => {
  it('calls the refine API when Send is clicked', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())
    render(<GenerateRecipeChatPanel {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'make it dairy-free' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/recipes/generate/refine',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('make it dairy-free'),
        })
      )
    })
  })

  it('calls the API when Enter key is pressed', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())
    render(<GenerateRecipeChatPanel {...defaultProps} />)

    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'make it spicy' } })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/recipes/generate/refine',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})

// ── T09: Successful refinement updates currentRecipe ─────────────────────────

describe('T09 - Successful refinement updates currentRecipe in panel state', () => {
  it('updates the recipe preview title after refinement', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())
    render(<GenerateRecipeChatPanel {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'make it dairy-free' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(screen.getByText('Dairy-Free Pasta')).toBeInTheDocument()
    })
  })
})

// ── T10: Assistant response appended with message text and changes bullets ────

describe('T10 - Assistant response appended with message text and changes bullets', () => {
  it('shows assistant message text in the chat', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())
    render(<GenerateRecipeChatPanel {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'make it dairy-free' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(screen.getByText('I swapped heavy cream for coconut milk.')).toBeInTheDocument()
      expect(screen.getByText('Replaced heavy cream with coconut milk')).toBeInTheDocument()
    })
  })
})

// ── T11: User message appended to chat before request fires ──────────────────

describe('T11 - User message appended to chat before request fires', () => {
  it('shows the user message immediately', async () => {
    // Use a slow-resolving fetch to check state before response
    let resolveFetch!: () => void
    mockFetch.mockImplementation(() =>
      new Promise((resolve) => {
        resolveFetch = () => resolve({ ok: true, json: async () => MOCK_REFINE_RESPONSE })
      })
    )

    render(<GenerateRecipeChatPanel {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'no cream please' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    // User message appears before response arrives
    await waitFor(() => {
      expect(screen.getByText('no cream please')).toBeInTheDocument()
    })

    // Resolve to avoid dangling promises
    act(() => resolveFetch())
  })
})

// ── T12: Input cleared after send ─────────────────────────────────────────────

describe('T12 - Input cleared after send', () => {
  it('clears the input field after message is sent', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())
    render(<GenerateRecipeChatPanel {...defaultProps} />)

    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'make it dairy-free' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('')
    })
  })
})

// ── T13: Input and send button disabled while loading ─────────────────────────

describe('T13 - Input and send button disabled while isLoading', () => {
  it('disables input and send button while a request is in flight', async () => {
    let resolveFetch!: () => void
    mockFetch.mockImplementation(() =>
      new Promise((resolve) => {
        resolveFetch = () => resolve({ ok: true, json: async () => MOCK_REFINE_RESPONSE })
      })
    )

    render(<GenerateRecipeChatPanel {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'no cream' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What would you like to change/i)).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    act(() => resolveFetch())
  })
})

// ── T14: LLM failure appends error message to chat ───────────────────────────

describe('T14 - LLM failure appends error message without losing conversation', () => {
  it('appends error message to chat on failure', async () => {
    mockFetch
      .mockImplementationOnce(() => makeSuccessResponse())
      .mockImplementationOnce(() => makeErrorResponse())

    render(<GenerateRecipeChatPanel {...defaultProps} />)

    // First message succeeds
    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'make it dairy-free' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await waitFor(() => {
      expect(screen.getByText('I swapped heavy cream for coconut milk.')).toBeInTheDocument()
    })

    // Second message fails
    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'now make it spicy' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong — try again/i)).toBeInTheDocument()
      // Prior history preserved
      expect(screen.getByText('make it dairy-free')).toBeInTheDocument()
      expect(screen.getByText('I swapped heavy cream for coconut milk.')).toBeInTheDocument()
    })
  })
})

// ── T16: "Use this recipe" calls onUseRecipe with currentRecipe ───────────────

describe('T16 - "Use this recipe" calls onUseRecipe with currentRecipe (not initialRecipe)', () => {
  it('calls onUseRecipe with the refined recipe after refinement', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())
    const onUseRecipe = vi.fn()
    render(<GenerateRecipeChatPanel {...defaultProps} onUseRecipe={onUseRecipe} />)

    // Refine first
    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'make it dairy-free' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await waitFor(() => {
      expect(screen.getByText('Dairy-Free Pasta')).toBeInTheDocument()
    })

    // Now click "Use this recipe"
    fireEvent.click(screen.getByRole('button', { name: 'Use this recipe' }))
    expect(onUseRecipe).toHaveBeenCalledWith(MOCK_REFINE_RESPONSE.recipe)
    expect(onUseRecipe).not.toHaveBeenCalledWith(INITIAL_RECIPE)
  })
})

// ── T17: "Use this recipe" available before any refinement ───────────────────

describe('T17 - "Use this recipe" available before any refinement', () => {
  it('shows "Use this recipe" button immediately on mount', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Use this recipe' })).toBeInTheDocument()
  })

  it('calls onUseRecipe with initialRecipe if no refinements made', () => {
    const onUseRecipe = vi.fn()
    render(<GenerateRecipeChatPanel {...defaultProps} onUseRecipe={onUseRecipe} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use this recipe' }))
    expect(onUseRecipe).toHaveBeenCalledWith(INITIAL_RECIPE)
  })
})

// ── T18: "Start over" calls onStartOver ──────────────────────────────────────

describe('T18 - "Start over" calls onStartOver', () => {
  it('calls onStartOver when "Start over" is clicked', () => {
    const onStartOver = vi.fn()
    render(<GenerateRecipeChatPanel {...defaultProps} onStartOver={onStartOver} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(onStartOver).toHaveBeenCalled()
  })
})

// ── T24: Chat scrolls to bottom after each new message ───────────────────────

describe('T24 - Chat scrolls to bottom after each new message', () => {
  it('calls scrollIntoView after a message is added', async () => {
    const scrollIntoViewMock = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock

    mockFetch.mockImplementation(() => makeSuccessResponse())
    render(<GenerateRecipeChatPanel {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'make it dairy-free' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled()
    })
  })
})

// ── T25: "View full recipe" expand/collapse toggles ingredient+step list ──────

describe('T25 - "View full recipe" expand/collapse', () => {
  it('does not show full ingredient list by default', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    // The expand section renders an "Ingredients" heading — should not be present when collapsed
    expect(screen.queryByRole('button', { name: /Hide/i })).not.toBeInTheDocument()
  })

  it('shows full recipe when "View full recipe" is clicked', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /View full recipe/i }))
    // The expand section shows "Ingredients" and "Steps" headings
    expect(screen.getAllByText(/^(Ingredients|Steps)$/).length).toBeGreaterThanOrEqual(1)
  })

  it('hides full recipe when the collapse button is clicked', () => {
    render(<GenerateRecipeChatPanel {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /View full recipe/i }))
    // After expanding, the collapse button (aria-label="Collapse recipe") is present
    expect(screen.getByRole('button', { name: /Collapse recipe/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Collapse recipe/i }))
    // After collapsing, "View full recipe" is back
    expect(screen.getByRole('button', { name: /View full recipe/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Collapse recipe/i })).not.toBeInTheDocument()
  })
})

// ── T26: In-flight request aborted when "Use this recipe" is clicked ──────────

describe('T26 - In-flight request aborted when "Use this recipe" clicked', () => {
  it('calls onUseRecipe immediately without waiting for the in-flight request', async () => {
    let abortCalled = false
    mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
      opts.signal?.addEventListener('abort', () => { abortCalled = true })
      return new Promise(() => { /* never resolves */ })
    })

    const onUseRecipe = vi.fn()
    render(<GenerateRecipeChatPanel {...defaultProps} onUseRecipe={onUseRecipe} />)

    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'make it spicy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    // Click "Use this recipe" while request is in flight
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What would you like to change/i)).toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use this recipe' }))

    expect(onUseRecipe).toHaveBeenCalled()
    await waitFor(() => {
      expect(abortCalled).toBe(true)
    })
  })
})

// ── T27: In-flight request aborted when "Start over" is clicked ───────────────

describe('T27 - In-flight request aborted when "Start over" clicked', () => {
  it('calls onStartOver immediately without waiting for the in-flight request', async () => {
    let abortCalled = false
    mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
      opts.signal?.addEventListener('abort', () => { abortCalled = true })
      return new Promise(() => { /* never resolves */ })
    })

    const onStartOver = vi.fn()
    render(<GenerateRecipeChatPanel {...defaultProps} onStartOver={onStartOver} />)

    fireEvent.change(screen.getByPlaceholderText(/What would you like to change/i), {
      target: { value: 'make it spicy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/What would you like to change/i)).toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))

    expect(onStartOver).toHaveBeenCalled()
    await waitFor(() => {
      expect(abortCalled).toBe(true)
    })
  })
})
