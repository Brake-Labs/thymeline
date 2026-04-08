// @vitest-environment jsdom
/**
 * Regression tests for ImportProgress
 * hotfix/import-progress-ui — progress bar must update on every poll via useState
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'


const mockFetch = vi.fn()
global.fetch = mockFetch

function makeJobResponse(completed: number, total: number, results: unknown[] = []) {
  return {
    ok: true,
    json: async () => ({ completed, total, results }),
  }
}

const PENDING_RESULT = { url: 'https://example.com/1', status: 'pending' }
const SUCCESS_RESULT = {
  url: 'https://example.com/1', status: 'success',
  recipe: { title: 'Chicken Stir Fry' },
}
const FAILED_RESULT = {
  url: 'https://example.com/2', status: 'failed',
  error: 'Could not parse',
}

beforeEach(() => {
  vi.useFakeTimers()
  mockFetch.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

async function renderProgress(onComplete = vi.fn()) {
  const { default: ImportProgress } = await import('../ImportProgress')
  return render(<ImportProgress jobId="job-1" onComplete={onComplete} />)
}

// ── Progress bar updates ──────────────────────────────────────────────────────

describe('progress bar reflects polled state', () => {
  it('shows 0% and "Waiting for results…" on initial render before first poll', async () => {
    mockFetch.mockResolvedValue(makeJobResponse(0, 0, []))

    await act(async () => { await renderProgress() })

    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('Waiting for results…')).toBeInTheDocument()
  })

  it('updates count label and percentage after each poll', async () => {
    mockFetch
      .mockResolvedValueOnce(makeJobResponse(1, 3, [SUCCESS_RESULT, PENDING_RESULT, PENDING_RESULT]))
      .mockResolvedValueOnce(makeJobResponse(2, 3, [SUCCESS_RESULT, SUCCESS_RESULT, PENDING_RESULT]))

    await act(async () => { await renderProgress() })

    // After first poll: 1/3
    expect(screen.getByText('Importing 1 of 3 recipes…')).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument()

    // Advance to second poll
    await act(async () => { vi.advanceTimersByTime(2000) })
    await act(async () => {})

    expect(screen.getByText('Importing 2 of 3 recipes…')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('shows "Import complete" and 100% when completed === total', async () => {
    const onComplete = vi.fn()
    mockFetch.mockResolvedValue(makeJobResponse(2, 2, [SUCCESS_RESULT, FAILED_RESULT]))

    await act(async () => { await renderProgress(onComplete) })

    expect(screen.getByText('Import complete')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})

// ── Result rows appear as they arrive ─────────────────────────────────────────

describe('result rows render as results arrive', () => {
  it('renders a row for each result with the correct icon and title', async () => {
    mockFetch.mockResolvedValue(
      makeJobResponse(2, 2, [SUCCESS_RESULT, FAILED_RESULT]),
    )

    await act(async () => { await renderProgress() })

    expect(screen.getByText('Chicken Stir Fry')).toBeInTheDocument()
    expect(screen.getByText('Could not parse')).toBeInTheDocument()

    // Success icon ✓, failed icon ✗
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('shows pending rows with … icon while in progress', async () => {
    mockFetch.mockResolvedValue(
      makeJobResponse(0, 2, [PENDING_RESULT, PENDING_RESULT]),
    )

    await act(async () => { await renderProgress() })

    const pendingIcons = screen.getAllByText('…')
    expect(pendingIcons.length).toBe(2)
  })
})

// ── onComplete is called once when done ───────────────────────────────────────

describe('onComplete callback', () => {
  it('calls onComplete with mapped ImportResult[] when job finishes', async () => {
    const onComplete = vi.fn()
    mockFetch.mockResolvedValue(makeJobResponse(1, 1, [SUCCESS_RESULT]))

    await act(async () => { await renderProgress(onComplete) })

    expect(onComplete).toHaveBeenCalledTimes(1)
    const [results] = onComplete.mock.calls[0] as [{ status: string; sourceUrl: string }[]]
    expect(results[0]!.status).toBe('ready')
    expect(results[0]!.sourceUrl).toBe('https://example.com/1')
  })

  it('does not call onComplete prematurely while still in progress', async () => {
    const onComplete = vi.fn()
    mockFetch
      .mockResolvedValueOnce(makeJobResponse(1, 3, [SUCCESS_RESULT, PENDING_RESULT, PENDING_RESULT]))
      .mockResolvedValue(makeJobResponse(1, 3, [SUCCESS_RESULT, PENDING_RESULT, PENDING_RESULT]))

    await act(async () => { await renderProgress(onComplete) })
    await act(async () => { vi.advanceTimersByTime(2000) })
    await act(async () => {})

    expect(onComplete).not.toHaveBeenCalled()
  })
})

// ── Cancel clears the interval ────────────────────────────────────────────────

describe('Cancel button', () => {
  it('clicking Cancel calls onComplete with current results and stops polling', async () => {
    const onComplete = vi.fn()
    mockFetch.mockResolvedValue(
      makeJobResponse(1, 3, [SUCCESS_RESULT, PENDING_RESULT, PENDING_RESULT]),
    )

    await act(async () => { await renderProgress(onComplete) })

    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'))
    })

    expect(onComplete).toHaveBeenCalledTimes(1)

    // No more fetches after cancel
    const callCount = mockFetch.mock.calls.length
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(mockFetch.mock.calls.length).toBe(callCount)
  })
})
