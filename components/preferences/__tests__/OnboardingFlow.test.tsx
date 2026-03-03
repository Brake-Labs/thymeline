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
    json: async () => ({ onboarding_completed: true }),
  })
})

describe('OnboardingFlow - step navigation', () => {
  it('starts on step 1 and shows step 1 content', () => {
    render(<OnboardingFlow allTags={['Healthy', 'Quick']} />)
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()
    expect(screen.getByText(/how many meal options/i)).toBeInTheDocument()
  })

  it('T08 - Back button navigates to previous step without saving', async () => {
    render(<OnboardingFlow allTags={['Healthy']} />)

    // Go to step 2
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()

    // Go back to step 1
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()

    // No API call should have been made
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('Back button is hidden on step 1', () => {
    render(<OnboardingFlow allTags={[]} />)
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
  })

  it('shows Next on steps 1-3, Done on step 4', async () => {
    render(<OnboardingFlow allTags={[]} />)
    expect(screen.getByText('Next')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Next')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Next')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
  })
})

describe('T06 - Skip for now saves only onboarding_completed', () => {
  it('calls PATCH with only onboarding_completed: true and redirects', async () => {
    render(<OnboardingFlow allTags={['Healthy']} />)

    fireEvent.click(screen.getByText('Skip for now'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/preferences')
    expect(opts.method).toBe('PATCH')
    const body = JSON.parse(opts.body)
    expect(body).toEqual({ onboarding_completed: true })
    expect(body).not.toHaveProperty('options_per_day')
    expect(body).not.toHaveProperty('preferred_tags')

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/recipes'))
  })
})

describe('T07 - Done saves all collected values', () => {
  it('calls PATCH with all step values plus onboarding_completed: true', async () => {
    render(<OnboardingFlow allTags={['Healthy', 'Quick']} />)

    // Step 1: change options_per_day to 4
    fireEvent.click(screen.getByLabelText('Increase'))
    fireEvent.click(screen.getByText('Next'))

    // Step 2: navigate through
    fireEvent.click(screen.getByText('Next'))

    // Step 3: navigate through
    fireEvent.click(screen.getByText('Next'))

    // Step 4: click Done
    fireEvent.click(screen.getByText('Done'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/preferences')
    expect(opts.method).toBe('PATCH')
    const body = JSON.parse(opts.body)
    expect(body.onboarding_completed).toBe(true)
    expect(body.options_per_day).toBe(4)
    expect(body).toHaveProperty('cooldown_days')
    expect(body).toHaveProperty('preferred_tags')
    expect(body).toHaveProperty('limited_tags')
    expect(body).toHaveProperty('avoided_tags')

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/recipes'))
  })
})

describe('T08 - collected values persist across Back navigation', () => {
  it('preserves options_per_day value after going Back from step 2', () => {
    render(<OnboardingFlow allTags={[]} />)

    // Increment to 4
    fireEvent.click(screen.getByLabelText('Increase'))
    expect(screen.getByText('4')).toBeInTheDocument()

    // Go to step 2
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()

    // Go back to step 1
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})

describe('T10/T11 - tag bucket exclusivity in onboarding', () => {
  it('T10 - preferred tags are not available for limited or avoided', () => {
    render(<OnboardingFlow allTags={['Healthy', 'Quick', 'Spicy']} />)

    // Go to step 3
    fireEvent.click(screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))

    // Select Healthy in preferred
    const healthyBtn = screen.getByText('Healthy')
    fireEvent.click(healthyBtn)

    // Go to step 4
    fireEvent.click(screen.getByText('Next'))

    // Healthy should not appear in limited or avoided pickers
    // (available for limited = tags not in preferred)
    // The Healthy button should not be present in the step 4 pickers
    // Quick and Spicy should be available for limited and/or avoided
    expect(screen.queryAllByText('Healthy')).toHaveLength(0)
    expect(screen.getAllByText('Quick').length).toBeGreaterThan(0)
  })
})
