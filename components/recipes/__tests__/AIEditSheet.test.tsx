// @vitest-environment jsdom
/**
 * Tests for AIEditSheet component
 * Covers spec-18 test cases: T04, T05, T06, T08, T09, T10, T11, T17, T18, T19, T21
 * Note: T04, T09, T10, T19 are tested from the page perspective; some are tested here via sheet isolation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'


const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const MOCK_RECIPE = {
  id: 'recipe-1',
  user_id: 'user-1',
  title: 'Roast Chicken',
  category: 'main_dish' as const,
  tags: ['Chicken'],
  url: null,
  notes: 'Great dish',
  ingredients: '1 whole chicken\n2 cans chickpeas',
  steps: 'Roast the chicken.\nServe with chickpeas.',
  image_url: null,
  is_shared: false,
  created_at: '2025-01-01T00:00:00Z',
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  inactive_time_minutes: null,
  servings: 4,
  source: 'manual' as const,
  step_photos: [],
}

const MOCK_AI_RESPONSE = {
  message: 'Done — I substituted black beans for chickpeas.',
  changes: ['Replaced chickpeas with black beans'],
  recipe: {
    title: 'Roast Chicken',
    ingredients: '1 whole chicken\n2 cans black beans',
    steps: 'Roast the chicken.\nServe with beans.',
    notes: 'Great dish',
    servings: 4,
  },
}

function makeSuccessResponse() {
  return Promise.resolve({
    ok: true,
    json: async () => MOCK_AI_RESPONSE,
  })
}

function makeErrorResponse() {
  return Promise.resolve({
    ok: false,
    status: 500,
    json: async () => ({ error: 'AI service error' }),
  })
}

// Lazy import so mocks are registered first
const { default: AIEditSheet } = await import('../AIEditSheet')

describe('AIEditSheet', () => {
  const onClose = vi.fn()
  const onCookModified = vi.fn()
  const onSaveAsNew = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    onClose.mockClear()
    onCookModified.mockClear()
    onSaveAsNew.mockClear()
  })

  // T05: Empty state message shown before first message
  it('T05 - shows empty state message before first message', () => {
    render(
      <AIEditSheet
        recipe={MOCK_RECIPE}
        isOpen={true}
        onClose={onClose}
        onCookModified={onCookModified}
        onSaveAsNew={onSaveAsNew}
      />
    )

    expect(screen.getByText(/Tell me what you'd like to change/i)).toBeInTheDocument()
  })

  // T06: Sending a message calls POST /api/recipes/[id]/ai-edit
  it('T06 - sending a message calls the API', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())

    render(
      <AIEditSheet
        recipe={MOCK_RECIPE}
        isOpen={true}
        onClose={onClose}
        onCookModified={onCookModified}
        onSaveAsNew={onSaveAsNew}
      />
    )

    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'no chickpeas please' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/recipes/recipe-1/ai-edit',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('no chickpeas please'),
        })
      )
    })
  })

  // T08: AI response updates currentRecipe state
  it('T08 - AI response updates currentRecipe state', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())

    render(
      <AIEditSheet
        recipe={MOCK_RECIPE}
        isOpen={true}
        onClose={onClose}
        onCookModified={onCookModified}
        onSaveAsNew={onSaveAsNew}
      />
    )

    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'no chickpeas' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(screen.getByText('Done — I substituted black beans for chickpeas.')).toBeInTheDocument()
    })

    // The cook button should now be visible with the updated recipe
    expect(screen.getByRole('button', { name: 'Cook from this version' })).toBeInTheDocument()
  })

  // T10: "Modified for tonight" badge — footer actions appear after first change
  it('T10 - footer actions appear after first modification', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())

    render(
      <AIEditSheet
        recipe={MOCK_RECIPE}
        isOpen={true}
        onClose={onClose}
        onCookModified={onCookModified}
        onSaveAsNew={onSaveAsNew}
      />
    )

    // Footer buttons not shown initially
    expect(screen.queryByRole('button', { name: 'Cook from this version' })).not.toBeInTheDocument()

    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'no chickpeas' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cook from this version' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save as new recipe' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reset changes' })).toBeInTheDocument()
    })
  })

  // T11: Second message builds on first modification (multi-turn)
  it('T11 - second message includes first turn in conversation_history', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())

    render(
      <AIEditSheet
        recipe={MOCK_RECIPE}
        isOpen={true}
        onClose={onClose}
        onCookModified={onCookModified}
        onSaveAsNew={onSaveAsNew}
      />
    )

    const textarea = screen.getByPlaceholderText(/What would you like to change/i)

    // First message
    fireEvent.change(textarea, { target: { value: 'no chickpeas' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await waitFor(() => {
      expect(screen.getByText('Done — I substituted black beans for chickpeas.')).toBeInTheDocument()
    })

    // Second message
    fireEvent.change(textarea, { target: { value: 'make it less spicy' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      const calls = mockFetch.mock.calls
      const secondCall = calls[1]
      expect(secondCall).toBeDefined()
      const body = JSON.parse(secondCall![1].body)
      expect(body.conversation_history.length).toBeGreaterThan(0)
      // First turn user message should be in history
      expect(body.conversation_history[0].role).toBe('user')
      expect(body.conversation_history[0].content).toContain('no chickpeas')
    })
  })

  // T17: "Reset changes" reverts recipe to original
  it('T17 - Reset changes reverts currentRecipe to original', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())

    render(
      <AIEditSheet
        recipe={MOCK_RECIPE}
        isOpen={true}
        onClose={onClose}
        onCookModified={onCookModified}
        onSaveAsNew={onSaveAsNew}
      />
    )

    // Send message to get modifications
    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'no chickpeas' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset changes' })).toBeInTheDocument()
    })

    // Verify "Cook from this version" is visible (modifications active)
    expect(screen.getByRole('button', { name: 'Cook from this version' })).toBeInTheDocument()

    // Click reset
    fireEvent.click(screen.getByRole('button', { name: 'Reset changes' }))

    // Footer actions should be gone (hasModifications = false)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cook from this version' })).not.toBeInTheDocument()
    })
  })

  // T18: "Reset changes" clears conversation history
  it('T18 - Reset changes clears conversation history', async () => {
    mockFetch.mockImplementation(() => makeSuccessResponse())

    render(
      <AIEditSheet
        recipe={MOCK_RECIPE}
        isOpen={true}
        onClose={onClose}
        onCookModified={onCookModified}
        onSaveAsNew={onSaveAsNew}
      />
    )

    const textarea = screen.getByPlaceholderText(/What would you like to change/i)
    fireEvent.change(textarea, { target: { value: 'no chickpeas' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await waitFor(() => {
      expect(screen.getByText('no chickpeas')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reset changes' })).toBeInTheDocument()
    })

    // Reset
    fireEvent.click(screen.getByRole('button', { name: 'Reset changes' }))

    // Message history should be gone
    await waitFor(() => {
      expect(screen.queryByText('no chickpeas')).not.toBeInTheDocument()
      expect(screen.queryByText('Done — I substituted black beans for chickpeas.')).not.toBeInTheDocument()
    })
  })

  // T21: LLM failure shows inline error without losing conversation
  it('T21 - LLM failure shows inline error and preserves history', async () => {
    mockFetch
      .mockImplementationOnce(() => makeSuccessResponse())
      .mockImplementationOnce(() => makeErrorResponse())

    render(
      <AIEditSheet
        recipe={MOCK_RECIPE}
        isOpen={true}
        onClose={onClose}
        onCookModified={onCookModified}
        onSaveAsNew={onSaveAsNew}
      />
    )

    const textarea = screen.getByPlaceholderText(/What would you like to change/i)

    // First succeeds
    fireEvent.change(textarea, { target: { value: 'no chickpeas' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })
    await waitFor(() => {
      expect(screen.getByText('Done — I substituted black beans for chickpeas.')).toBeInTheDocument()
    })

    // Second fails
    fireEvent.change(textarea, { target: { value: 'make it less spicy' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
      // First message history still present
      expect(screen.getByText('no chickpeas')).toBeInTheDocument()
      expect(screen.getByText('Done — I substituted black beans for chickpeas.')).toBeInTheDocument()
    })
  })
})
