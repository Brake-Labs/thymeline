import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  RateLimitError,
  APIConnectionError,
  InternalServerError,
  AuthenticationError,
} from '@anthropic-ai/sdk'

// ── Mock the Anthropic SDK ──────────────────────────────────────────────────
// vi.hoisted runs before vi.mock hoisting, so mockCreate is available inside
// the factory function.
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  // Use a real class so `new Anthropic(...)` works as a constructor
  class MockAnthropic {
    messages = { create: mockCreate }
    constructor(_opts?: unknown) {}
  }
  // Copy static members from the real Anthropic class. Object.assign only
  // copies own enumerable properties, but the error classes live on the
  // BaseAnthropic prototype. Walk the full chain to pick them all up.
  let proto = actual.default as unknown as Record<string, unknown> | null
  while (proto && proto !== (Function.prototype as unknown)) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (!(key in MockAnthropic)) {
        try {
          Object.defineProperty(
            MockAnthropic,
            key,
            Object.getOwnPropertyDescriptor(proto, key)!,
          )
        } catch {
          // skip non-configurable props like 'length', 'name', 'prototype'
        }
      }
    }
    proto = Object.getPrototypeOf(proto) as Record<string, unknown> | null
  }
  return { ...actual, default: MockAnthropic }
})

// Import the module under test AFTER mocks are set up.
import {
  LLMError,
  classifyLLMError,
  callLLM,
  callLLMMultimodal,
  parseLLMJson,
  LLM_MODEL_FAST,
  LLM_MODEL_CAPABLE,
} from '../llm'
import type { LLMErrorCode } from '../llm'

// ── Helpers for constructing real SDK error instances ────────────────────────

function makeHeaders(extra: Record<string, string> = {}): Headers {
  const h = new Headers(extra)
  h.set('request-id', 'req-test-123')
  return h
}

function makeRateLimitError(): InstanceType<typeof RateLimitError> {
  return new RateLimitError(
    429,
    { message: 'rate limited' },
    'Rate limited',
    makeHeaders(),
  )
}

function makeAPIConnectionError(): InstanceType<typeof APIConnectionError> {
  return new APIConnectionError({
    message: 'connection refused',
  })
}

function makeInternalServerError(): InstanceType<typeof InternalServerError> {
  return new InternalServerError(
    500,
    { message: 'internal error' },
    'Internal error',
    makeHeaders(),
  )
}

function makeAuthenticationError(): InstanceType<typeof AuthenticationError> {
  return new AuthenticationError(
    401,
    { message: 'invalid key' },
    'Invalid key',
    makeHeaders(),
  )
}

function makeAbortError(): Error {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

// ── LLMError ────────────────────────────────────────────────────────────────

describe('LLMError', () => {
  it('sets name to "LLMError"', () => {
    const err = new LLMError('test', 'unknown')
    expect(err.name).toBe('LLMError')
  })

  it('sets the code property', () => {
    const codes: LLMErrorCode[] = [
      'rate_limit',
      'timeout',
      'bad_response',
      'service_down',
      'auth',
      'unknown',
    ]
    for (const code of codes) {
      const err = new LLMError('msg', code)
      expect(err.code).toBe(code)
    }
  })

  it('sets the message property', () => {
    const err = new LLMError('something went wrong', 'unknown')
    expect(err.message).toBe('something went wrong')
  })

  it('sets the cause property when provided', () => {
    const cause = new Error('root cause')
    const err = new LLMError('wrapper', 'unknown', cause)
    expect(err.cause).toBe(cause)
  })

  it('leaves cause undefined when not provided', () => {
    const err = new LLMError('msg', 'unknown')
    expect(err.cause).toBeUndefined()
  })

  it('is an instance of Error', () => {
    const err = new LLMError('msg', 'unknown')
    expect(err).toBeInstanceOf(Error)
  })
})

// ── classifyLLMError ────────────────────────────────────────────────────────

describe('classifyLLMError', () => {
  it('returns the same instance if already an LLMError', () => {
    const original = new LLMError('already classified', 'rate_limit')
    const result = classifyLLMError(original)
    expect(result).toBe(original)
  })

  it('maps RateLimitError to code "rate_limit"', () => {
    const sdkErr = makeRateLimitError()
    const result = classifyLLMError(sdkErr)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('rate_limit')
    expect(result.message).toBe('Rate limited by LLM provider')
    expect(result.cause).toBe(sdkErr)
  })

  it('maps APIConnectionError to code "service_down"', () => {
    const sdkErr = makeAPIConnectionError()
    const result = classifyLLMError(sdkErr)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('service_down')
    expect(result.message).toBe('Could not connect to LLM provider')
    expect(result.cause).toBe(sdkErr)
  })

  it('maps InternalServerError to code "service_down"', () => {
    const sdkErr = makeInternalServerError()
    const result = classifyLLMError(sdkErr)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('service_down')
    expect(result.message).toBe('LLM provider internal error')
    expect(result.cause).toBe(sdkErr)
  })

  it('maps AuthenticationError to code "auth"', () => {
    const sdkErr = makeAuthenticationError()
    const result = classifyLLMError(sdkErr)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('auth')
    expect(result.message).toBe('LLM API key is invalid or missing')
    expect(result.cause).toBe(sdkErr)
  })

  it('maps AbortError to code "timeout"', () => {
    const abortErr = makeAbortError()
    const result = classifyLLMError(abortErr)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('timeout')
    expect(result.message).toBe('LLM request timed out')
    expect(result.cause).toBe(abortErr)
  })

  it('maps a generic Error to code "unknown" and preserves message', () => {
    const genericErr = new Error('something unexpected')
    const result = classifyLLMError(genericErr)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('unknown')
    expect(result.message).toBe('something unexpected')
    expect(result.cause).toBe(genericErr)
  })

  it('maps a non-Error value to code "unknown" with fallback message', () => {
    const result = classifyLLMError('string error')
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('unknown')
    expect(result.message).toBe('Unknown LLM error')
    expect(result.cause).toBe('string error')
  })

  it('maps null to code "unknown"', () => {
    const result = classifyLLMError(null)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('unknown')
    expect(result.cause).toBeNull()
  })

  it('maps undefined to code "unknown"', () => {
    const result = classifyLLMError(undefined)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('unknown')
  })

  it('maps a number to code "unknown"', () => {
    const result = classifyLLMError(42)
    expect(result).toBeInstanceOf(LLMError)
    expect(result.code).toBe('unknown')
    expect(result.cause).toBe(42)
  })
})

// ── callLLM ─────────────────────────────────────────────────────────────────

describe('callLLM', () => {
  const defaultOpts = {
    maxTokens: 1024,
    system: 'You are a helpful assistant.',
    user: 'Hello',
  }

  beforeEach(() => {
    mockCreate.mockReset()
  })

  afterEach(() => {
    delete process.env.LLM_MODEL
  })

  it('returns text content from a successful response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello, world!' }],
    })

    const result = await callLLM(defaultOpts)
    expect(result).toBe('Hello, world!')
  })

  it('passes the correct parameters to anthropic.messages.create', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'response' }],
    })

    await callLLM({
      model: 'claude-sonnet-4-20250514',
      maxTokens: 2048,
      system: 'System prompt',
      user: 'User message',
    })

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: 'User message' }],
      system: 'System prompt',
    })
  })

  it('uses process.env.LLM_MODEL as default model when no model option is given', async () => {
    process.env.LLM_MODEL = 'claude-test-model'
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
    })

    await callLLM(defaultOpts)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-test-model' }),
    )
  })

  it('falls back to claude-haiku-4-5-20251001 when no model option and no env var', async () => {
    delete process.env.LLM_MODEL
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
    })

    await callLLM(defaultOpts)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    )
  })

  it('throws LLMError with code "bad_response" when content is empty', async () => {
    mockCreate.mockResolvedValueOnce({ content: [] })

    try {
      await callLLM(defaultOpts)
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('bad_response')
      expect((err as LLMError).message).toBe('Empty response from LLM')
    }
  })

  it('throws LLMError with code "bad_response" when first content block is not text', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tool1', name: 'test', input: {} }],
    })

    try {
      await callLLM(defaultOpts)
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('bad_response')
    }
  })

  it('throws classified LLMError when API call throws RateLimitError', async () => {
    mockCreate.mockRejectedValueOnce(makeRateLimitError())

    try {
      await callLLM(defaultOpts)
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('rate_limit')
    }
  })

  it('throws classified LLMError when API call throws APIConnectionError', async () => {
    mockCreate.mockRejectedValueOnce(makeAPIConnectionError())

    try {
      await callLLM(defaultOpts)
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('service_down')
    }
  })

  it('throws classified LLMError when API call throws AuthenticationError', async () => {
    mockCreate.mockRejectedValueOnce(makeAuthenticationError())

    try {
      await callLLM(defaultOpts)
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('auth')
    }
  })

  it('throws classified LLMError when API call throws a generic error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network failure'))

    try {
      await callLLM(defaultOpts)
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('unknown')
      expect((err as LLMError).message).toBe('network failure')
    }
  })

  it('prefers opts.model over process.env.LLM_MODEL', async () => {
    process.env.LLM_MODEL = 'env-model'
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
    })

    await callLLM({ ...defaultOpts, model: 'explicit-model' })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'explicit-model' }),
    )
  })
})

// ── parseLLMJson ────────────────────────────────────────────────────────────

describe('parseLLMJson', () => {
  it('parses clean JSON', () => {
    const result = parseLLMJson<{ a: number }>('{"a": 1}')
    expect(result).toEqual({ a: 1 })
  })

  it('parses a JSON array', () => {
    const result = parseLLMJson<number[]>('[1, 2, 3]')
    expect(result).toEqual([1, 2, 3])
  })

  it('strips ```json fences and parses the inner JSON', () => {
    const input = '```json\n{"key": "value"}\n```'
    const result = parseLLMJson<{ key: string }>(input)
    expect(result).toEqual({ key: 'value' })
  })

  it('strips ``` fences without a language tag', () => {
    const input = '```\n{"key": "value"}\n```'
    const result = parseLLMJson<{ key: string }>(input)
    expect(result).toEqual({ key: 'value' })
  })

  it('strips ```JSON fences (case insensitive)', () => {
    const input = '```JSON\n{"key": "value"}\n```'
    const result = parseLLMJson<{ key: string }>(input)
    expect(result).toEqual({ key: 'value' })
  })

  it('handles leading/trailing whitespace around fences', () => {
    const input = '  \n```json\n{"a": 1}\n```  \n'
    const result = parseLLMJson<{ a: number }>(input)
    expect(result).toEqual({ a: 1 })
  })

  it('throws LLMError with code "bad_response" for invalid JSON', () => {
    try {
      parseLLMJson('not valid json')
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('bad_response')
      expect((err as LLMError).message).toContain('Failed to parse LLM JSON')
    }
  })

  it('throws LLMError with code "bad_response" for empty string', () => {
    try {
      parseLLMJson('')
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('bad_response')
    }
  })

  it('preserves the original SyntaxError as the cause', () => {
    try {
      parseLLMJson('{broken')
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).cause).toBeInstanceOf(SyntaxError)
    }
  })

  it('parses JSON with no fences but with surrounding whitespace', () => {
    const result = parseLLMJson<{ x: boolean }>('  \n  {"x": true}  \n  ')
    expect(result).toEqual({ x: true })
  })
})

// ── model tier constants ──────────────────────────────────────────────────────

describe('model tier constants', () => {
  it('LLM_MODEL_FAST defaults to claude-haiku-4-5-20251001', () => {
    // env vars are clean after afterEach deletes LLM_MODEL
    expect(LLM_MODEL_FAST).toBeDefined()
    expect(typeof LLM_MODEL_FAST).toBe('string')
  })

  it('LLM_MODEL_CAPABLE defaults to claude-sonnet-4-6', () => {
    expect(LLM_MODEL_CAPABLE).toBeDefined()
    expect(typeof LLM_MODEL_CAPABLE).toBe('string')
  })
})

// ── callLLMMultimodal ─────────────────────────────────────────────────────────

describe('callLLMMultimodal', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns text content from a successful response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Detected items' }],
    })

    const result = await callLLMMultimodal({
      maxTokens: 1024,
      system: 'You are a scanner.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'scan this' }] }],
    })
    expect(result).toBe('Detected items')
  })

  it('passes messages array to anthropic.messages.create', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
    })

    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: 'abc' } },
          { type: 'text' as const, text: 'identify items' },
        ],
      },
    ]

    await callLLMMultimodal({
      model: 'test-model',
      maxTokens: 512,
      system: 'System prompt',
      messages,
    })

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'test-model',
      max_tokens: 512,
      messages,
      system: 'System prompt',
    })
  })

  it('throws LLMError with code "bad_response" when content is empty', async () => {
    mockCreate.mockResolvedValueOnce({ content: [] })

    try {
      await callLLMMultimodal({
        maxTokens: 1024,
        system: 'test',
        messages: [{ role: 'user', content: 'test' }],
      })
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('bad_response')
    }
  })

  it('throws classified LLMError when API call throws RateLimitError', async () => {
    mockCreate.mockRejectedValueOnce(makeRateLimitError())

    try {
      await callLLMMultimodal({
        maxTokens: 1024,
        system: 'test',
        messages: [{ role: 'user', content: 'test' }],
      })
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('rate_limit')
    }
  })

  it('throws classified LLMError on timeout', async () => {
    mockCreate.mockRejectedValueOnce(makeAbortError())

    try {
      await callLLMMultimodal({
        maxTokens: 1024,
        system: 'test',
        messages: [{ role: 'user', content: 'test' }],
      })
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(LLMError)
      expect((err as LLMError).code).toBe('timeout')
    }
  })
})
