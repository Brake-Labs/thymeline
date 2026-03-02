import { describe, it, expect } from 'vitest'

describe('supabase client', () => {
  it('exports a supabase client instance', async () => {
    // Set required env vars before importing the module
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

    const { supabase } = await import('./supabase')

    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
    expect(typeof supabase.auth).toBe('object')
  })
})
