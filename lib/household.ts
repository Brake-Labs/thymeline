import { eq, type SQL, type Column } from 'drizzle-orm'
import { db } from './db'
import { householdMembers, recipes, mealPlans, customTags, groceryLists, pantryItems, userPreferences } from './db/schema'
import type { HouseholdContext, HouseholdRole } from '@/types'

/**
 * Returns the household context for a user, or null if they are not in a household.
 */
export async function resolveHouseholdScope(
  userId: string,
): Promise<HouseholdContext | null> {
  const rows = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1)
  if (!rows[0]) return null
  return { householdId: rows[0].householdId, role: rows[0].role as HouseholdRole }
}

/**
 * Checks whether the user's role permits write access to shared settings.
 */
export function canManage(role: HouseholdRole): boolean {
  return role === 'owner' || role === 'co_owner'
}

// ── Scoping helpers ────────────────────────────────────────────────────────────

interface ScopeColumns {
  userId: Column
  householdId: Column
}

/**
 * Returns a Drizzle SQL condition for scoping queries.
 * Household members → filter by householdId; solo users → filter by userId.
 */
export function scopeCondition(
  columns: ScopeColumns,
  userId: string,
  ctx: HouseholdContext | null,
): SQL {
  if (ctx) {
    return eq(columns.householdId, ctx.householdId)
  }
  return eq(columns.userId, userId)
}

/**
 * Returns scope fields to spread into an insert .values() call.
 */
export function scopeInsert(
  userId: string,
  ctx: HouseholdContext | null,
): { userId: string; householdId?: string } {
  if (ctx) return { userId, householdId: ctx.householdId }
  return { userId }
}

// ── Table registry for checkOwnership ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry maps string keys to Drizzle table schemas with varying column types
const tableRegistry: Record<string, any> = {
  recipes,
  meal_plans: mealPlans,
  custom_tags: customTags,
  grocery_lists: groceryLists,
  pantry_items: pantryItems,
  user_preferences: userPreferences,
}

/**
 * Verifies that a record belongs to the current user/household scope.
 */
export async function checkOwnership(
  tableName: string,
  id: string,
  userId: string,
  ctx: HouseholdContext | null,
): Promise<{ owned: true } | { owned: false; status: 404 | 403 }> {
  const table = tableRegistry[tableName]
  if (!table) return { owned: false, status: 404 }

  const rows = await db
    .select({
      userId: table.userId,
      householdId: table.householdId,
    })
    .from(table)
    .where(eq(table.id, id))
    .limit(1)

  if (rows.length === 0) return { owned: false, status: 404 }

  const record = rows[0]!
  if (ctx) {
    if (record.householdId !== ctx.householdId) return { owned: false, status: 403 }
  } else {
    if (record.userId !== userId) return { owned: false, status: 403 }
  }

  return { owned: true }
}
