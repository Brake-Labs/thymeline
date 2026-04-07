/**
 * Server-only tag validation. Separated from lib/tags.ts because
 * it imports from lib/db (node-postgres), which cannot be bundled
 * for client components.
 */
import 'server-only'

import { db } from '@/lib/db'
import { customTags as customTagsTable } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import type { HouseholdContext } from '@/types'

/**
 * Validates tags against the first-class list + the user's custom tags.
 * Returns `{ valid: true }` or `{ valid: false, unknownTags }`.
 */
export async function validateTags(
  _db: unknown,
  tags: string[],
  userId: string,
  ctx: HouseholdContext | null,
): Promise<{ valid: true } | { valid: false; unknownTags: string[] }> {
  if (tags.length === 0) return { valid: true }

  const customTags = await db
    .select({ name: customTagsTable.name })
    .from(customTagsTable)
    .where(scopeCondition({ userId: customTagsTable.userId, householdId: customTagsTable.householdId }, userId, ctx))

  const knownNames = new Set([
    ...FIRST_CLASS_TAGS.map((t) => t.toLowerCase()),
    ...customTags.map((t) => t.name.toLowerCase()),
  ])

  const unknownTags = tags.filter((t) => !knownNames.has(t.toLowerCase()))
  if (unknownTags.length > 0) {
    return { valid: false, unknownTags }
  }
  return { valid: true }
}
