import { type SupabaseClient } from '@supabase/supabase-js'

export type HouseholdScope =
  | { type: 'solo' }
  | { type: 'household'; householdId: string }

/**
 * Returns the household scope for a user.
 * Always call this with the admin client (service role) so it can bypass RLS.
 * Falls back to 'solo' if the household tables don't exist (migration 017 not run)
 * or if the user is not in a household.
 */
export async function resolveHouseholdScope(
  db: SupabaseClient,
  userId: string,
): Promise<HouseholdScope> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .single()
    if (error || !data) return { type: 'solo' }
    return { type: 'household', householdId: (data as { household_id: string }).household_id }
  } catch {
    // Table doesn't exist or query failed — degrade gracefully to solo scope
    return { type: 'solo' }
  }
}
