import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { logger } from './logger'
import { getRequestContext } from './request-context'

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

// ── Usage tracking (fire-and-forget) ─────────────────────────────────────────

function trackUsage(model: string, inputTokens: number, outputTokens: number) {
  if (process.env.DEV_BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production') return
  const ctx = getRequestContext()
  if (!ctx) return

  // Lazy import to avoid circular deps (db → schema → ... → llm)
  import('./db').then(({ db }) =>
    import('./db/schema').then(({ llmUsage }) =>
      db.insert(llmUsage).values({
        userId: ctx.userId,
        feature: ctx.feature,
        model,
        inputTokens,
        outputTokens,
      })
    )
  ).catch((err) => logger.warn({ err }, 'llm usage tracking failed'))
}

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
  logger.debug({ model, maxTokens: opts.maxTokens }, 'callLLM start')
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
      logger.error({ model }, 'callLLM returned empty response')
      throw new LLMError('Empty response from LLM', 'bad_response')
    }
    logger.debug({ model, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens }, 'callLLM ok')
    trackUsage(model, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0)
    return text
  } catch (err) {
    if (err instanceof LLMError) throw err
    const classified = classifyLLMError(err)
    logger.error({ model, code: classified.code, message: classified.message }, 'callLLM failed')
    throw classified
  }
}

// ── Multimodal helper ─────────────────────────────────────────────────────────

export interface CallLLMMultimodalOptions {
  model?: string
  maxTokens: number
  system: string
  messages: MessageParam[]
  temperature?: number
  /** Pass tools (e.g. web_search) to enable tool use in the response. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[]
}

export interface CallLLMMultimodalResult {
  text: string
  response: Anthropic.Messages.Message
}

/**
 * Make an LLM call with multi-content messages (images, etc.).
 * Uses the centralized Anthropic client (retry + timeout included).
 *
 * When called without tools, returns the text content as a string (backwards compatible).
 * When called with tools, returns { text, response } so callers can inspect tool use blocks.
 */
export async function callLLMMultimodal(opts: CallLLMMultimodalOptions & { tools: CallLLMMultimodalOptions['tools'] }): Promise<CallLLMMultimodalResult>
export async function callLLMMultimodal(opts: CallLLMMultimodalOptions): Promise<string>
export async function callLLMMultimodal(opts: CallLLMMultimodalOptions): Promise<string | CallLLMMultimodalResult> {
  const model = opts.model ?? LLM_MODEL_FAST
  logger.debug({ model, maxTokens: opts.maxTokens, messageCount: opts.messages.length, hasTools: !!opts.tools }, 'callLLMMultimodal start')
  try {
    const createOpts: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: opts.maxTokens,
      messages: opts.messages,
      system: opts.system,
      ...(opts.temperature !== undefined && { temperature: opts.temperature }),
      ...(opts.tools && { tools: opts.tools }),
    }
    const response = await anthropic.messages.create(createOpts)
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    if (!text && !opts.tools) {
      logger.error({ model }, 'callLLMMultimodal returned empty response')
      throw new LLMError('Empty response from LLM', 'bad_response')
    }
    logger.debug({ model, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens }, 'callLLMMultimodal ok')
    trackUsage(model, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0)
    if (opts.tools) {
      return { text, response }
    }
    return text
  } catch (err) {
    if (err instanceof LLMError) throw err
    const classified = classifyLLMError(err)
    logger.error({ model, code: classified.code, message: classified.message }, 'callLLMMultimodal failed')
    throw classified
  }
}

/**
 * Extract JSON from text that may contain a markdown code fence anywhere
 * (e.g. prose introduction followed by ```json ... ```).
 * Returns the fence contents if found, otherwise the trimmed text as-is.
 */
function extractJsonFromText(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fenceMatch ? fenceMatch[1]!.trim() : trimmed
}

/**
 * Parse an LLM response as JSON, stripping markdown code fences if present.
 * Handles fences that appear anywhere in the text (e.g. after a prose preamble).
 * Throws LLMError with code 'bad_response' on parse failure.
 */
export function parseLLMJson<T>(text: string): T {
  const stripped = extractJsonFromText(text)
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
 * Handles fences that appear anywhere in the text (e.g. after a prose preamble).
 */
export function parseLLMJsonSafe<T>(text: string): T | null {
  try {
    const stripped = extractJsonFromText(text)
    return JSON.parse(stripped) as T
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'parseLLMJsonSafe failed to parse')
    return null
  }
}
