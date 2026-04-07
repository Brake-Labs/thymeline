/**
 * Database query helpers for common patterns.
 */

/**
 * Returns exactly one row or throws. Replaces Supabase `.single()` semantics
 * for ownership checks and required lookups.
 */
export function dbSingle<T>(rows: T[]): T {
  if (rows.length === 0) {
    throw new Error('Expected exactly one row, got 0')
  }
  if (rows.length > 1) {
    throw new Error(`Expected exactly one row, got ${rows.length}`)
  }
  return rows[0]!
}

/**
 * Returns the first row or null. For optional lookups where
 * zero rows is a valid outcome.
 */
export function dbFirst<T>(rows: T[]): T | null {
  return rows[0] ?? null
}
