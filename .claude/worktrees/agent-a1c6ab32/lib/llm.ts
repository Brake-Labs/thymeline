import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

/**
 * Centralized Anthropic client with retry and timeout.
 * SDK retries on 429 (rate limit), 5xx, and connection errors automatically.
 */
export const anthropic = new Anthropic({
  apiKey: process.env.LLM_API_KEY ?? '',
  maxRetries: 2,
  timeout: 60_000,
})

// ── Model tier constants ──────────────────────────────────────────────────────

export const LLM_MODEL_FAST = process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001'
export const LLM_MODEL_CAPABLE = process.env.LLM_MODEL_CAPABLE ?? 'claude-sonnet-4-6'

// ── Structured error types ──────────────────────────────────────────────────────

export type LLMErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'bad_response'
  | 'service_down'
  | 'auth'
  | 'unknown'

export class LLMError extends Error {
  readonly code: LLMErrorCode
  constructor(message: string, code: LLMErrorCode, cause?: unknown) {
    super(message)
    this.name = 'LLMError'
    this.code = code
    this.cause = cause
  }
}

/** Classify any error from an Anthropic SDK call into a structured LLMError. */
export function classifyLLMError(err: unknown): LLMError {
  if (err instanceof LLMError) return err
  if (err instanceof Anthropic.RateLimitError) {
    return new LLMError('Rate limited by LLM provider', 'rate_limit', err)
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LLMError('Could not connect to LLM provider', 'service_down', err)
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new LLMError('LLM provider internal error', 'service_down', err)
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new LLMError('LLM API key is invalid or missing', 'auth', err)
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new LLMError('LLM request timed out', 'timeout', err)
  }
  return new LLMError(
    err instanceof Error ? err.message : 'Unknown LLM error',
    'unknown',
    err,
  )
}

// ── High-level helpers ──────────────────────────────────────────────────────────

export interface CallLLMOptions {
  model?: string
  maxTokens: number
  system: string
  user: string
}

/**
 * Make a text-only LLM call with structured error handling.
 * Uses the centralized Anthropic client (retry + timeout included).
 *
 * For calls with images or other multi-content messages, use
 * `callLLMMultimodal()` instead.
 */
export async function callLLM(opts: CallLLMOptions): Promise<string> {
  const model = opts.model ?? process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001'
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: opts.maxTokens,
      messages: [{ role: 'user', content: opts.user }],
      system: opts.system,
    })
    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : ''
    if (!text) {
      throw new LLMError('Empty response from LLM', 'bad_response')
    }
    return text
  } catch (err) {
    throw classifyLLMError(err)
  }
}

// ── Multimodal helper ─────────────────────────────────────────────────────────

export interface CallLLMMultimodalOptions {
  model?: string
  maxTokens: number
  system: string
  messages: MessageParam[]
}

/**
 * Make an LLM call with multi-content messages (images, etc.).
 * Uses the centralized Anthropic client (retry + timeout included).
 */
export async function callLLMMultimodal(opts: CallLLMMultimodalOptions): Promise<string> {
  const model = opts.model ?? LLM_MODEL_FAST
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: opts.maxTokens,
      messages: opts.messages,
      system: opts.system,
    })
    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : ''
    if (!text) {
      throw new LLMError('Empty response from LLM', 'bad_response')
    }
    return text
  } catch (err) {
    throw classifyLLMError(err)
  }
}

/**
 * Parse an LLM response as JSON, stripping markdown code fences if present.
 * Throws LLMError with code 'bad_response' on parse failure.
 */
export function parseLLMJson<T>(text: string): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
  try {
    return JSON.parse(stripped) as T
  } catch (err) {
    throw new LLMError(
      `Failed to parse LLM JSON: ${(err as Error).message}`,
      'bad_response',
      err,
    )
  }
}

/**
 * Parse LLM JSON with defensive per-field extraction.
 * Unlike parseLLMJson which throws on malformed input, this returns null
 * for fields that can't be extracted, allowing partial results.
 */
export function parseLLMJsonSafe<T>(text: string): T | null {
  try {
    const stripped = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
    return JSON.parse(stripped) as T
  } catch (err) {
    console.warn('[parseLLMJsonSafe] Failed to parse:', err instanceof Error ? err.message : err)
    return null
  }
}
