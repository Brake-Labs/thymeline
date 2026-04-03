// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import ActiveTimersBar from '../ActiveTimersBar'
import type { TimerState } from '../StepTimer'

function makeTimer(overrides: Partial<TimerState> = {}): TimerState {
  return {
    stepIndex: 0,
    label: 'Simmer',
    minutes: 5,
    seconds: 0,
    remaining: 300,
    running: true,
    isExpired: false,
    ...overrides,
  }
}

const noop = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── T1: New timer → scroll + flash ───────────────────────────────────────────

describe('ActiveTimersBar — new timer starts', () => {
  it('scrolls to top when timer count increases from 0 to 1', async () => {
    const { rerender } = render(
      <ActiveTimersBar timers={[]} onPause={noop} onReset={noop} onDismiss={noop} />
    )

    await act(async () => {
      rerender(
        <ActiveTimersBar
          timers={[makeTimer()]}
          onPause={noop}
          onReset={noop}
          onDismiss={noop}
        />
      )
    })

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('shows flash ring immediately after count increases', async () => {
    const { rerender } = render(
      <ActiveTimersBar timers={[]} onPause={noop} onReset={noop} onDismiss={noop} />
    )

    await act(async () => {
      rerender(
        <ActiveTimersBar
          timers={[makeTimer()]}
          onPause={noop}
          onReset={noop}
          onDismiss={noop}
        />
      )
    })

    expect(document.querySelector('.ring-2')).not.toBeNull()
  })

  it('removes flash ring after 1200ms', async () => {
    const { rerender } = render(
      <ActiveTimersBar timers={[]} onPause={noop} onReset={noop} onDismiss={noop} />
    )

    await act(async () => {
      rerender(
        <ActiveTimersBar
          timers={[makeTimer()]}
          onPause={noop}
          onReset={noop}
          onDismiss={noop}
        />
      )
    })

    expect(document.querySelector('.ring-2')).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1200)
    })

    expect(document.querySelector('.ring-2')).toBeNull()
  })
})

// ── T2: Count unchanged (tick) → no scroll ───────────────────────────────────

describe('ActiveTimersBar — timer count unchanged', () => {
  it('does not call scrollTo when the timer ticks but count stays the same', async () => {
    const timer = makeTimer({ remaining: 300 })

    const { rerender } = render(
      <ActiveTimersBar timers={[timer]} onPause={noop} onReset={noop} onDismiss={noop} />
    )

    // The initial render has prevCountRef=1 and visible.length=1, so no scroll fires.
    // Clear any spurious calls before the re-render under test.
    vi.mocked(window.scrollTo).mockClear()

    // Timer ticks down — count unchanged (still 1 running timer)
    await act(async () => {
      rerender(
        <ActiveTimersBar
          timers={[{ ...timer, remaining: 299 }]}
          onPause={noop}
          onReset={noop}
          onDismiss={noop}
        />
      )
    })

    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
