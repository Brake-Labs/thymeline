import { describe, it, expect } from 'vitest'
import { getRequestContext, withRequestContext } from '../request-context'

describe('request-context', () => {
  it('returns null when no context is set', () => {
    expect(getRequestContext()).toBeNull()
  })

  it('returns context within withRequestContext', () => {
    const ctx = { userId: 'user-1', feature: 'discover' }
    withRequestContext(ctx, () => {
      expect(getRequestContext()).toEqual(ctx)
    })
  })

  it('returns null after withRequestContext exits', () => {
    withRequestContext({ userId: 'u', feature: 'f' }, () => {})
    expect(getRequestContext()).toBeNull()
  })

  it('returns the value from the wrapped function', () => {
    const result = withRequestContext({ userId: 'u', feature: 'f' }, () => 42)
    expect(result).toBe(42)
  })

  it('handles async functions', async () => {
    const result = await withRequestContext({ userId: 'u', feature: 'f' }, async () => {
      const ctx = getRequestContext()
      return ctx?.userId
    })
    expect(result).toBe('u')
  })
})
