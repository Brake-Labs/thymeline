// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OnboardingFlow from '../OnboardingFlow'

// Mock router
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))


// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockPush.mockClear()
  mockFetch.mockClear()
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ onboardingCompleted: true }),
  })
})

describe('OnboardingFlow - step navigation', () => {
  it('starts on step 1 and shows step 1 content', () => {
    render(<OnboardingFlow allTags={['Healthy', 'Quick']} />)
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument()
    expect(screen.getByText(/set your planning defaults/i)).toBeInTheDocument()
  })

  it('T08 - Back button navigates to previous step without saving', async () => {
    render(<OnboardingFlow allTags={['Healthy']} />)

    // Go to step 2
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument()

    // Go back to step 1
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument()

    // No API call should have been made
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('Back button is hidden on step 1', () => {
    render(<OnboardingFlow allTags={[]} />)
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
  })

  it('shows Next on steps 1-2, Done on step 3', async () => {
    render(<OnboardingFlow allTags={[]} />)
    expect(screen.getByText('Next')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Next')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
  })
})

describe('T06 - Skip preferences saves only onboardingCompleted', () => {
  it('calls PATCH with only onboardingCompleted: true and redirects', async () => {
    render(<OnboardingFlow allTags={['Healthy']} />)

    fireEvent.click(screen.getByText('Skip preferences'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toBe('/api/preferences')
    expect(opts.method).toBe('PATCH')
    const body = JSON.parse(opts.body)
    expect(body).toEqual({ onboardingCompleted: true })
    expect(body).not.toHaveProperty('optionsPerDay')
    expect(body).not.toHaveProperty('preferredTags')

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/recipes'))
  })
})

describe('T07 - Done saves all collected values', () => {
  it('calls PATCH with all step values plus onboardingCompleted: true', async () => {
    render(<OnboardingFlow allTags={['Healthy', 'Quick']} />)

    // Step 1: change optionsPerDay to 4
    fireEvent.click(screen.getByLabelText('Increase'))
    fireEvent.click(screen.getByText('Next'))

    // Step 2: navigate through preferred tags
    fireEvent.click(screen.getByText('Next'))

    // Step 3: click Done
    fireEvent.click(screen.getByText('Done'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const [url, opts] = mockFetch.mock.calls[0]!
    expect(url).toBe('/api/preferences')
    expect(opts.method).toBe('PATCH')
    const body = JSON.parse(opts.body)
    expect(body.onboardingCompleted).toBe(true)
    expect(body.optionsPerDay).toBe(4)
    expect(body).toHaveProperty('cooldownDays')
    expect(body).toHaveProperty('preferredTags')
    expect(body).toHaveProperty('limitedTags')
    expect(body).toHaveProperty('avoidedTags')

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/recipes'))
  })
})

describe('T08 - collected values persist across Back navigation', () => {
  it('preserves optionsPerDay value after going Back from step 2', () => {
    render(<OnboardingFlow allTags={[]} />)

    // Increment to 4
    fireEvent.click(screen.getByLabelText('Increase'))
    expect(screen.getByText('4')).toBeInTheDocument()

    // Go to step 2
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument()

    // Go back to step 1
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})

describe('T10/T11 - tag bucket exclusivity in onboarding', () => {
  it('T10 - preferred tags are not available for limited or avoided', () => {
    render(<OnboardingFlow allTags={['Healthy', 'Quick', 'Spicy']} />)

    // Go to step 2 (preferred tags)
    fireEvent.click(screen.getByText('Next'))

    // Select Healthy in preferred
    const healthyBtn = screen.getByText('Healthy')
    fireEvent.click(healthyBtn)

    // Go to step 3 (limit/avoid)
    fireEvent.click(screen.getByText('Next'))

    // Healthy should not appear in limited or avoided pickers
    // (available for limited = tags not in preferred)
    // The Healthy button should not be present in the step 4 pickers
    // Quick and Spicy should be available for limited and/or avoided
    expect(screen.queryAllByText('Healthy')).toHaveLength(0)
    expect(screen.getAllByText('Quick').length).toBeGreaterThan(0)
  })
})
