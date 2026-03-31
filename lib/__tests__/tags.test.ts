import { describe, it, expect } from 'vitest'
import { type SupabaseClient } from '@supabase/supabase-js'
import { validateTags, FIRST_CLASS_TAGS } from '@/lib/tags'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockDb(customTags: { name: string }[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: customTags, error: null }),
      }),
    }),
  } as unknown as SupabaseClient
}

const userId = 'user-1'
const ctx = null

// ---------------------------------------------------------------------------
// validateTags
// ---------------------------------------------------------------------------

describe('validateTags', () => {
  it('accepts all known first-class tags', async () => {
    const db = mockDb([])
    const result = await validateTags(db, [...FIRST_CLASS_TAGS], userId, ctx)
    expect(result).toEqual({ valid: true })
  })

  it('rejects unknown tags and lists them', async () => {
    const db = mockDb([])
    const result = await validateTags(db, ['Comfort', 'Unknown'], userId, ctx)
    expect(result).toEqual({ valid: false, unknownTags: ['Unknown'] })
  })

  it('matches tags case-insensitively', async () => {
    const db = mockDb([])
    const result = await validateTags(db, ['comfort', 'GRILL', 'Vegetarian'], userId, ctx)
    expect(result).toEqual({ valid: true })
  })

  it('accepts custom tags from the user library', async () => {
    const db = mockDb([{ name: 'Date Night' }, { name: 'Kid Friendly' }])
    const result = await validateTags(db, ['Date Night', 'kid friendly'], userId, ctx)
    expect(result).toEqual({ valid: true })
  })

  it('returns valid for an empty tags array', async () => {
    const db = mockDb([])
    const result = await validateTags(db, [], userId, ctx)
    expect(result).toEqual({ valid: true })
  })
})
