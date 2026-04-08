/**
 * Tests for lib/recipe-export.ts
 * Covers: T23, T24
 */

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { slugify, triggerDownload } from '../recipe-export'

describe('slugify', () => {
  it('T23: converts title to lowercase kebab-case', () => {
    expect(slugify('Chicken Parmesan!')).toBe('chicken-parmesan')
  })

  it('T24: handles special characters and multiple spaces', () => {
    expect(slugify('  My Favorite    Recipe!! (v2)  ')).toBe('my-favorite-recipe-v2')
    expect(slugify('Crème Brûlée')).toBe('cr-me-br-l-e')
    expect(slugify('One---Two___Three')).toBe('one-two-three')
    expect(slugify('')).toBe('')
  })
})

// ── triggerDownload (regression: #370) ───────────────────────────────────────

describe('triggerDownload', () => {
  it('creates an anchor with download attribute and clicks it', () => {
    const clickMock = vi.fn()
    const fakeAnchor = { href: '', download: '', click: clickMock } as unknown as HTMLAnchorElement

    vi.spyOn(document, 'createElement').mockReturnValueOnce(fakeAnchor)
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce((n) => n)
    vi.spyOn(document.body, 'removeChild').mockImplementationOnce((n) => n)
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:test-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementationOnce(() => {})

    triggerDownload(new Blob(['test']), 'export.json')

    expect(fakeAnchor.download).toBe('export.json')
    expect(clickMock).toHaveBeenCalled()
  })

  it('does not call navigator.share even when canShare returns true', () => {
    const shareMock = vi.fn()
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })

    const fakeAnchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValueOnce(fakeAnchor)
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce((n) => n)
    vi.spyOn(document.body, 'removeChild').mockImplementationOnce((n) => n)
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:test-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementationOnce(() => {})

    triggerDownload(new Blob(['test']), 'export.json')

    expect(shareMock).not.toHaveBeenCalled()
  })
})
