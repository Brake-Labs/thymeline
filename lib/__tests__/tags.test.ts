import { describe, it, expect, vi } from 'vitest'
import { FIRST_CLASS_TAGS } from '@/lib/tags'

// ── Mock the db module ─────────────────────────────────────────────────────────

function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin',
    'set', 'values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning', 'groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  )
  return chain
}

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  }
  return { mockDb }
})

vi.mock('@/lib/db', () => ({
  db: mockDb,
}))

// Import after mocking
import { validateTags } from '@/lib/tags-server'

const userId = 'user-1'
const ctx = null

// ── validateTags ────────────────────────────────────────────────────────────────

describe('validateTags', () => {
  it('accepts all known first-class tags', async () => {
    const chain = mockChain([])
    mockDb.select.mockReturnValue(chain)

    const result = await validateTags(null, [...FIRST_CLASS_TAGS], userId, ctx)
    expect(result).toEqual({ valid: true })
  })

  it('rejects unknown tags and lists them', async () => {
    const chain = mockChain([])
    mockDb.select.mockReturnValue(chain)

    const result = await validateTags(null, ['Comfort', 'Unknown'], userId, ctx)
    expect(result).toEqual({ valid: false, unknownTags: ['Unknown'] })
  })

  it('matches tags case-insensitively', async () => {
    const chain = mockChain([])
    mockDb.select.mockReturnValue(chain)

    const result = await validateTags(null, ['comfort', 'GRILL', 'Vegetarian'], userId, ctx)
    expect(result).toEqual({ valid: true })
  })

  it('accepts custom tags from the user library', async () => {
    const chain = mockChain([{ name: 'Date Night' }, { name: 'Kid Friendly' }])
    mockDb.select.mockReturnValue(chain)

    const result = await validateTags(null, ['Date Night', 'kid friendly'], userId, ctx)
    expect(result).toEqual({ valid: true })
  })

  it('returns valid for an empty tags array', async () => {
    const result = await validateTags(null, [], userId, ctx)
    expect(result).toEqual({ valid: true })
  })
})
