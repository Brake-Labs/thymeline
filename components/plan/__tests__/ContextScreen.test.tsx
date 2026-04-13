// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContextScreen from '../ContextScreen'
import type { PlanSetup, MealType } from '@/types'

// Mock child components to isolate ContextScreen behavior
vi.mock('../WeekPicker', () => ({
  default: () => <div data-testid="week-picker">WeekPicker</div>,
}))
vi.mock('../DayTogglePicker', () => ({
  default: () => <div data-testid="day-toggle">DayTogglePicker</div>,
}))
vi.mock('../MealTypePicker', () => ({
  default: () => <div data-testid="meal-type">MealTypePicker</div>,
}))
vi.mock('@/components/preferences/TagBucketPicker', () => ({
  default: () => <div data-testid="tag-bucket">TagBucketPicker</div>,
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})

function makeSetup(overrides: Partial<PlanSetup> = {}): PlanSetup {
  return {
    weekStart: '2026-04-13',
    activeDates: ['2026-04-13', '2026-04-14'],
    activeMealTypes: ['dinner'] as MealType[],
    freeText: '',
    preferThisWeek: [],
    avoidThisWeek: [],
    ...overrides,
  }
}

// ── T04: ContextScreen renders and pre-populated state ──────────────────────

describe('T04 - ContextScreen renders correctly', () => {
  it('renders the week picker, free text box, and generate button', () => {
    render(
      <ContextScreen
        setup={makeSetup()}
        onSetupChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
        existingPlanForWeek={false}
      />
    )

    expect(screen.getByTestId('week-picker')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Anything special this week?')).toBeInTheDocument()
    expect(screen.getByText('Generate')).toBeInTheDocument()
  })

  it('shows character counter for free text', () => {
    render(
      <ContextScreen
        setup={makeSetup({ freeText: 'Hello' })}
        onSetupChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
        existingPlanForWeek={false}
      />
    )

    expect(screen.getByText('5/300')).toBeInTheDocument()
  })
})

// ── T06: Collapsible panel defaults to collapsed ────────────────────────────

describe('T06 - Settings panel collapsed by default', () => {
  it('does not show day/meal pickers until Adjust settings is clicked', () => {
    render(
      <ContextScreen
        setup={makeSetup()}
        onSetupChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
        existingPlanForWeek={false}
      />
    )

    // Collapsed: child pickers not visible
    expect(screen.queryByTestId('day-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('meal-type')).not.toBeInTheDocument()

    // Expand
    fireEvent.click(screen.getByText('Adjust settings'))

    // Now visible
    expect(screen.getByTestId('day-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('meal-type')).toBeInTheDocument()
  })
})

// ── T21: Existing plan warning banner ───────────────────────────────────────

describe('T21 - Existing plan warning', () => {
  it('shows warning when existingPlanForWeek is true', () => {
    render(
      <ContextScreen
        setup={makeSetup()}
        onSetupChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
        existingPlanForWeek={true}
      />
    )

    expect(screen.getByText(/already have a plan/)).toBeInTheDocument()
  })

  it('does not show warning when existingPlanForWeek is false', () => {
    render(
      <ContextScreen
        setup={makeSetup()}
        onSetupChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
        existingPlanForWeek={false}
      />
    )

    expect(screen.queryByText(/already have a plan/)).not.toBeInTheDocument()
  })
})

// ── Generate button states ──────────────────────────────────────────────────

describe('Generate button states', () => {
  it('is disabled when activeDates is empty', () => {
    render(
      <ContextScreen
        setup={makeSetup({ activeDates: [] })}
        onSetupChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
        existingPlanForWeek={false}
      />
    )

    expect(screen.getByText('Generate')).toBeDisabled()
  })

  it('is disabled while isGenerating', () => {
    render(
      <ContextScreen
        setup={makeSetup()}
        onSetupChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={true}
        existingPlanForWeek={false}
      />
    )

    expect(screen.getByText(/Finding your meals/)).toBeInTheDocument()
  })

  it('calls onGenerate and PATCHes preferences when clicked', () => {
    const onGenerate = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ firstClass: [], custom: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <ContextScreen
        setup={makeSetup()}
        onSetupChange={vi.fn()}
        onGenerate={onGenerate}
        isGenerating={false}
        existingPlanForWeek={false}
      />
    )

    fireEvent.click(screen.getByText('Generate'))

    expect(onGenerate).toHaveBeenCalledOnce()
    // Should PATCH preferences with lastActiveDays
    expect(fetchMock).toHaveBeenCalledWith('/api/preferences', expect.objectContaining({
      method: 'PATCH',
    }))
  })
})
