import { type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { HouseholdContext, HouseholdRole } from '@/types'

/**
 * Returns the household context for a user, or null if they are not in a household.
 * Always call this with the admin client (service role).
 */
export async function resolveHouseholdScope(
  db: SupabaseClient<Database>,
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

// ── Scoping helpers ────────────────────────────────────────────────────────────

/** Any Supabase query builder that supports `.eq()` chaining. */
interface Scopeable {
  eq(column: string, value: string): this
}

/**
 * Adds the correct scope filter to a Supabase query.
 * Household members → filter by household_id; solo users → filter by user_id.
 */
export function scopeQuery<T extends Scopeable>(
  query: T,
  userId: string,
  ctx: HouseholdContext | null,
): T {
  if (ctx) {
    return query.eq('household_id', ctx.householdId)
  }
  return query.eq('user_id', userId)
}

/**
 * Builds an insert payload with the correct scope fields.
 * Household members → includes household_id + user_id; solo users → user_id only.
 */
export function scopeInsert(
  userId: string,
  ctx: HouseholdContext | null,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (ctx) {
    return { ...payload, household_id: ctx.householdId, user_id: userId }
  }
  return { ...payload, user_id: userId }
}

/**
 * Verifies that a record belongs to the current user/household scope.
 * Returns `{ owned: true }` or `{ owned: false, status: 404 | 403 }`.
 */
export async function checkOwnership(
  db: SupabaseClient,
  table: string,
  id: string,
  userId: string,
  ctx: HouseholdContext | null,
): Promise<{ owned: true } | { owned: false; status: 404 | 403 }> {
  const { data, error } = await db
    .from(table)
    .select('user_id, household_id')
    .eq('id', id)
    .single()

  if (error || !data) return { owned: false, status: 404 }

  const record = data as { user_id: string; household_id: string | null }
  if (ctx) {
    if (record.household_id !== ctx.householdId) return { owned: false, status: 403 }
  } else {
    if (record.user_id !== userId) return { owned: false, status: 403 }
  }

  return { owned: true }
}
