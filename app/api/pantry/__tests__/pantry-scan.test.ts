/**
 * Tests for POST /api/pantry/scan.
 * Covers spec-12 test case: T22
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }

// Module-level mock state for LLM responses
const mockScanState = {
  llmResponse: '{ "detected": [] }',
  shouldThrow:  false,
}

vi.mock('@/lib/llm', () => ({
  callLLMMultimodal: vi.fn().mockImplementation(async () => {
    if (mockScanState.shouldThrow) throw new Error('LLM unavailable')
    return mockScanState.llmResponse
  }),
  classifyLLMError: (err: unknown) => ({ code: 'unknown', message: err instanceof Error ? err.message : 'unknown' }),
  parseLLMJson: (text: string) => JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()),
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient: () => ({}),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scopeQuery: (query: any, userId: string, ctx: any) => {
    if (ctx) return query.eq('household_id', ctx.householdId)
    return query.eq('user_id', userId)
  },
}))

import { createServerClient } from '@/lib/supabase-server'

function makeAuthMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
  }
}

function makeReq(body?: unknown): Request {
  return new Request('http://localhost/api/pantry/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── T22: Returns { detected: [] } when LLM response is invalid JSON ───────────

describe('T22 - POST /api/pantry/scan returns { detected: [] } on invalid LLM response', () => {
  beforeEach(() => {
    vi.resetModules()
    mockScanState.llmResponse = '{ "detected": [] }'
    mockScanState.shouldThrow = false
  })

  it('returns { detected: [] } when LLM returns invalid JSON', async () => {
    mockScanState.llmResponse = 'this is not valid json at all }{'
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('../scan/route')
    const res = await POST(
      makeReq({ image: 'dGVzdA==' }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.detected).toEqual([])
  })

  it('returns { detected: [], error } when LLM call throws', async () => {
    mockScanState.shouldThrow = true
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('../scan/route')
    const res = await POST(
      makeReq({ image: 'dGVzdA==' }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.detected).toEqual([])
    expect(json.error).toBe('Scan service unavailable')
  })

  it('returns { detected: [] } when no image is provided', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('../scan/route')
    const res = await POST(makeReq({}) as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.detected).toEqual([])
  })
})
