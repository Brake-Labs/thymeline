import { describe, it, expect } from 'vitest'

describe('llm client', () => {
  it('exports an llm client instance', async () => {
    process.env.LLM_MODEL = 'Anthropic'
    process.env.LLM_API_KEY = 'test-api-key'

    const { llmClient } = await import('./llm')

    expect(llmClient).toBeDefined()
    expect(typeof llmClient.createChatCompletionNonStreaming).toBe('function')
  })
})
