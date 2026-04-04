import { describe, it, expect } from 'vitest'

describe('llm client', () => {
  it('exports an Anthropic client instance', async () => {
    process.env.LLM_API_KEY = 'test-api-key'

    const { anthropic } = await import('./llm')

    expect(anthropic).toBeDefined()
    expect(typeof anthropic.messages.create).toBe('function')
  })
})
