// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LogDateSection from '../LogDateSection'


const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeLogResponse(alreadyLogged = false, madeOn = '2026-03-13') {
  return Promise.resolve({
    ok: true,
    json: async () => ({ madeOn: madeOn, alreadyLogged: alreadyLogged }),
  })
}

const defaultProps = {
  recipeId: 'recipe-1',
  onLogged: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue(makeLogResponse())
})

describe('LogDateSection - Today button', () => {
  it('renders Today, Yesterday, and Pick a date buttons', () => {
    render(<LogDateSection {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick a date' })).toBeInTheDocument()
  })

  it('Today button calls log API with today\'s date', async () => {
    const today = new Date().toISOString().split('T')[0]
    mockFetch.mockResolvedValueOnce(makeLogResponse(false, today))

    render(<LogDateSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))

    await waitFor(() => {
      const [url, opts] = mockFetch.mock.calls[0]!
      expect(url).toContain('/api/recipes/recipe-1/log')
      expect(JSON.parse(opts.body).madeOn).toBe(today)
    })
  })

  it('Yesterday button calls log API with yesterday\'s date', async () => {
    const yesterday = (() => {
      const d = new Date(); d.setDate(d.getDate() - 1)
      return d.toISOString().split('T')[0]
    })()
    mockFetch.mockResolvedValueOnce(makeLogResponse(false, yesterday))

    render(<LogDateSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }))

    await waitFor(() => {
      const [, opts] = mockFetch.mock.calls[0]!
      expect(JSON.parse(opts.body).madeOn).toBe(yesterday)
    })
  })

  it('calls onLogged with the date after successful log', async () => {
    const onLogged = vi.fn()
    const today = new Date().toISOString().split('T')[0]
    mockFetch.mockResolvedValueOnce(makeLogResponse(false, today))

    render(<LogDateSection {...defaultProps} onLogged={onLogged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))

    await waitFor(() => {
      expect(onLogged).toHaveBeenCalledWith(today)
    })
  })

  it('shows ✓ Logged! on success', async () => {
    render(<LogDateSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))

    await waitFor(() => {
      expect(screen.getByText('✓ Logged!')).toBeInTheDocument()
    })
  })

  it('shows Already logged for that day on duplicate', async () => {
    mockFetch.mockResolvedValueOnce(makeLogResponse(true))

    render(<LogDateSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))

    await waitFor(() => {
      expect(screen.getByText('Already logged for that day')).toBeInTheDocument()
    })
  })

  it('does not call onLogged when alreadyLogged=true', async () => {
    const onLogged = vi.fn()
    mockFetch.mockResolvedValueOnce(makeLogResponse(true))

    render(<LogDateSection {...defaultProps} onLogged={onLogged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))

    await waitFor(() => {
      expect(screen.getByText('Already logged for that day')).toBeInTheDocument()
    })
    expect(onLogged).not.toHaveBeenCalled()
  })
})

describe('LogDateSection - Pick a date', () => {
  it('clicking Pick a date shows a date input and Log button', () => {
    render(<LogDateSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }))
    expect(screen.getByDisplayValue('')).toBeInTheDocument() // date input
    expect(screen.getByRole('button', { name: 'Log' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('Log button is disabled until a date is selected', () => {
    render(<LogDateSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }))
    expect(screen.getByRole('button', { name: 'Log' })).toBeDisabled()
  })

  it('logs the picked date when Log is clicked', async () => {
    render(<LogDateSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }))

    // Open the custom DateInput calendar
    const calendarTrigger = screen
      .getAllByRole('button')
      .find((btn) => btn.getAttribute('aria-haspopup') === 'dialog')!
    fireEvent.click(calendarTrigger)

    // Pick the first non-disabled day from the calendar grid
    const dayButtons = screen
      .getAllByRole('button')
      .filter((btn) => /^\d{4}-\d{2}-\d{2}$/.test(btn.getAttribute('aria-label') ?? ''))
    const firstEnabled = dayButtons.find((btn) => !btn.hasAttribute('disabled'))!
    const pickedISO = firstEnabled.getAttribute('aria-label')!
    fireEvent.click(firstEnabled)

    // Log button is now enabled; click it
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))

    await waitFor(() => {
      const [, opts] = mockFetch.mock.calls[0]!
      expect(JSON.parse(opts.body).madeOn).toBe(pickedISO)
    })
  })

  it('Cancel returns to the three-button view', () => {
    render(<LogDateSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Pick a date' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log' })).not.toBeInTheDocument()
  })
})
