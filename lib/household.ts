import { type SupabaseClient } from '@supabase/supabase-js'
import type { HouseholdContext, HouseholdRole } from '@/types'

/**
 * Returns the household context for a user, or null if they are not in a household.
 * Always call this with the admin client (service role).
 */
export async function resolveHouseholdScope(
  db: SupabaseClient,
  userId: string,
): Promise<HouseholdContext | null> {
  const { data } = await db
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', userId)
    .single()
  if (!data) return null
  return { householdId: data.household_id, role: data.role as HouseholdRole }
}

/**
 * Checks whether the user's role permits write access to shared settings
 * (preferences, tag management, member management).
 */
export function canManage(role: HouseholdRole): boolean {
  return role === 'owner' || role === 'co_owner'
}
