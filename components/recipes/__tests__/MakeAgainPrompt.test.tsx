// @vitest-environment jsdom
/**
 * Tests for MakeAgainPrompt component
 * Covers spec test cases: T01, T02, T03, T04, T05
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import MakeAgainPrompt from '../MakeAgainPrompt'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.useFakeTimers()

const defaultProps = {
  entryId:  'entry-1',
  recipeId: 'recipe-1',
  getToken: async () => 'mock-token',
  onDismiss: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('MakeAgainPrompt', () => {
  // T01: component renders expected buttons
  it('T01: renders "How did it go?" with Make again, Not for us, Skip', () => {
    render(<MakeAgainPrompt {...defaultProps} />)
    expect(screen.getByText(/how did it go/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /make again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /not for us/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
  })

  // T02: Make again calls PATCH with make_again: true
  it('T02: "Make again" calls PATCH with make_again: true', async () => {
    render(<MakeAgainPrompt {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /make again/i }))
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/recipes/recipe-1/log/entry-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ make_again: true }),
      }),
    )
  })

  // T03: Not for us calls PATCH with make_again: false
  it('T03: "Not for us" calls PATCH with make_again: false', async () => {
    render(<MakeAgainPrompt {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /not for us/i }))
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/recipes/recipe-1/log/entry-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ make_again: false }),
      }),
    )
  })

  // T04: Skip makes no API call and calls onDismiss immediately
  it('T04: "Skip" makes no API call and calls onDismiss immediately', () => {
    const onDismiss = vi.fn()
    render(<MakeAgainPrompt {...defaultProps} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalled()
  })

  // T05: onDismiss is called after 1 second on selection
  it('T05: onDismiss called after 1 second when Make again is selected', async () => {
    const onDismiss = vi.fn()
    render(<MakeAgainPrompt {...defaultProps} onDismiss={onDismiss} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /make again/i }))
    })
    expect(mockFetch).toHaveBeenCalled()

    expect(onDismiss).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(1000) })
    expect(onDismiss).toHaveBeenCalled()
  })

  // Error handling: PATCH failure still calls onDismiss after 1s
  it('still calls onDismiss after 1s even when PATCH fails', async () => {
    const onDismiss = vi.fn()
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    render(<MakeAgainPrompt {...defaultProps} onDismiss={onDismiss} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /make again/i }))
    })
    expect(mockFetch).toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(1000) })
    expect(onDismiss).toHaveBeenCalled()
  })
})
