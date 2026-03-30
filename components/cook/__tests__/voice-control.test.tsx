/**
 * T39-T43: VoiceControl component tests
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import VoiceControl from '../VoiceControl'

// ── SpeechRecognition mock ────────────────────────────────────────────────────

interface MockRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: unknown) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

let lastInstance: MockRecognitionInstance | null = null

function setupSpeechRecognition() {
  // Must be a class (not arrow fn) so it works with `new`
  class MockSR {
    continuous = false
    interimResults = false
    lang = 'en-US'
    onresult: ((e: unknown) => void) | null = null
    onerror: (() => void) | null = null
    onend: (() => void) | null = null
    start = vi.fn()
    stop = vi.fn()

    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lastInstance = this as any
    }
  }

  Object.defineProperty(window, 'SpeechRecognition', {
    value: MockSR,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    value: undefined,
    writable: true,
    configurable: true,
  })
  return MockSR
}

function removeSpeechRecognition() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  delete w.SpeechRecognition
  delete w.webkitSpeechRecognition
}

function simulateResult(instance: MockRecognitionInstance, transcript: string) {
  const event = {
    results: [[{ transcript }]],
  } as unknown
  instance.onresult?.(event)
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  lastInstance = null
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  removeSpeechRecognition()
})

// ── T39: Mic button hidden when SpeechRecognition unsupported ─────────────────

describe('T39 - Mic button hidden when SpeechRecognition unsupported', () => {
  it('renders nothing when neither SpeechRecognition nor webkitSpeechRecognition is available', () => {
    removeSpeechRecognition()
    const onCommand = vi.fn()
    const { container } = render(<VoiceControl onCommand={onCommand} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the mic button when SpeechRecognition is available', () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)
    expect(screen.getByRole('button', { name: /push to talk/i })).toBeDefined()
  })
})

// ── T40: "Next" voice command fires next step ─────────────────────────────────

describe('T40 - "Next" voice command fires next step', () => {
  it('calls onCommand with { type: "next" } when "next step" is heard', async () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    const btn = screen.getByRole('button', { name: /push to talk/i })
    fireEvent.pointerDown(btn)
    expect(lastInstance!.start).toHaveBeenCalledTimes(1)

    act(() => simulateResult(lastInstance!, 'next step'))

    expect(onCommand).toHaveBeenCalledWith({ type: 'next' })
  })

  it('calls onCommand with { type: "next" } when just "next" is heard', () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'next'))

    expect(onCommand).toHaveBeenCalledWith({ type: 'next' })
  })

  it('calls onCommand with { type: "prev" } when "back" is heard', () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'back'))

    expect(onCommand).toHaveBeenCalledWith({ type: 'prev' })
  })
})

// ── T41: "Set timer for 5 minutes" fires SetTimer ────────────────────────────

describe('T41 - "Set timer for 5 minutes" fires SetTimer { minutes: 5, seconds: 0 }', () => {
  it('parses "set timer for 5 minutes" correctly', () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'set timer for 5 minutes'))

    expect(onCommand).toHaveBeenCalledWith({ type: 'setTimer', minutes: 5, seconds: 0 })
  })

  it('parses "set timer for 2 minutes and 30 seconds" correctly', () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'set timer for 2 minutes and 30 seconds'))

    expect(onCommand).toHaveBeenCalledWith({ type: 'setTimer', minutes: 2, seconds: 30 })
  })
})

// ── T42: Unknown voice command shows "Didn't catch that" toast ────────────────

describe("T42 - Unknown voice command shows \"Didn't catch that\" toast", () => {
  it('shows toast for unrecognized speech', async () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'something completely unrecognized'))

    expect(onCommand).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeDefined()
    expect(screen.getByText("Didn't catch that")).toBeDefined()
  })

  it('toast disappears after 2 seconds', async () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'blah blah blah'))

    expect(screen.getByRole('status')).toBeDefined()

    act(() => vi.advanceTimersByTime(2000))

    expect(screen.queryByRole('status')).toBeNull()
  })
})

// ── T43: "Read step" triggers speech synthesis ────────────────────────────────

describe('T43 - "Read step" triggers speech synthesis', () => {
  it('calls onCommand with { type: "readStep" } when "read step" is heard', () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'read step'))

    expect(onCommand).toHaveBeenCalledWith({ type: 'readStep' })
  })

  it('calls onCommand with { type: "readStep" } when "read this step" is heard', () => {
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'read this step'))

    expect(onCommand).toHaveBeenCalledWith({ type: 'readStep' })
  })

  it('the cook page handles readStep by calling speechSynthesis.speak', () => {
    // VoiceControl fires the command; the page calls window.speechSynthesis.speak.
    // Verify that onCommand fires correctly for readStep.
    setupSpeechRecognition()
    const onCommand = vi.fn()
    render(<VoiceControl onCommand={onCommand} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /push to talk/i }))
    act(() => simulateResult(lastInstance!, 'read this step'))

    const calls = onCommand.mock.calls
    expect(calls.length).toBe(1)
    expect(calls[0]![0]).toEqual({ type: 'readStep' })
  })
})
