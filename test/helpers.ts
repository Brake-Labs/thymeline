/**
 * Shared test utilities for API route tests.
 *
 * These helpers reduce mock duplication across test files. They provide the
 * OBJECTS that vi.mock() returns — vi.mock() calls must remain in each test
 * file because vitest hoists them.
 *
 * Usage:
 *   import { mockSupabase, mockHousehold, makeRequest, defaultMockState, tableMock } from '@/test/helpers'
 */
import { vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The mock user shape used across tests. */
export interface MockUser {
  id: string
}

/** A single table's mock method overrides (select, insert, update, etc.). */
export type TableBehavior = Record<string, (...args: unknown[]) => unknown>

/** Config object mapping table names to their mock behaviors. */
export type TableConfig = Record<string, TableBehavior>

// ---------------------------------------------------------------------------
// 1. mockSupabase — returns the factory object for vi.mock('@/lib/supabase-server')
// ---------------------------------------------------------------------------

/**
 * Build the mock module shape for `@/lib/supabase-server`.
 *
 * @param mockFromFn  A `from(table)` function that dispatches to table-specific mocks.
 * @param getUserFn   Optional override for `auth.getUser`. Defaults to reading from
 *                    whatever `mockState.user` the caller defines.
 *
 * Returns `{ createServerClient, createAdminClient }` suitable for vi.mock's factory.
 */
export function mockSupabase(
  mockFromFn: (table: string) => unknown,
  getUserFn: () => Promise<{ data: { user: MockUser | null }; error: { message: string } | null }>,
) {
  return {
    createServerClient: () => ({
      auth: { getUser: getUserFn },
      from: mockFromFn,
    }),
    createAdminClient: () => ({ from: mockFromFn }),
  }
}

// ---------------------------------------------------------------------------
// 2. mockHousehold — returns the factory object for vi.mock('@/lib/household')
// ---------------------------------------------------------------------------

interface HouseholdContext {
  resolveHouseholdScope?: (...args: unknown[]) => Promise<{ householdId: string; role: string } | null>
  canManage?: (role: string) => boolean
}

/**
 * Build the mock module shape for `@/lib/household`.
 *
 * By default:
 * - `resolveHouseholdScope` is a vi.fn() that resolves to `null` (solo user).
 * - `canManage` checks for 'owner' or 'co_owner'.
 */
export function mockHousehold(ctx?: HouseholdContext) {
  return {
    resolveHouseholdScope:
      ctx?.resolveHouseholdScope ?? vi.fn().mockResolvedValue(null),
    canManage:
      ctx?.canManage ?? ((role: string) => role === 'owner' || role === 'co_owner'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock mirrors real scopeQuery behavior
    scopeQuery: (query: any, userId: string, hctx: any) => {
      if (hctx) return query.eq('household_id', hctx.householdId)
      return query.eq('user_id', userId)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock mirrors real scopeInsert behavior
    scopeInsert: (userId: string, hctx: any, payload: Record<string, unknown>) => {
      if (hctx) return { ...payload, household_id: hctx.householdId, user_id: userId }
      return { ...payload, user_id: userId }
    },
  }
}

// ---------------------------------------------------------------------------
// 3. makeRequest — creates a NextRequest with JSON body and auth header
// ---------------------------------------------------------------------------

/**
 * Create a `NextRequest` suitable for API route handler tests.
 *
 * @param method  HTTP method (GET, POST, PATCH, DELETE, etc.)
 * @param url     Full URL string (e.g. 'http://localhost/api/tags')
 * @param body    Optional JSON-serializable body (omit for GET)
 * @param headers Optional extra headers (Authorization is always included)
 */
export function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
): NextRequest {
  const opts: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
      ...headers,
    },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  return new NextRequest(url, opts)
}

// ---------------------------------------------------------------------------
// 4. defaultMockState — returns a fresh baseline mock state object
// ---------------------------------------------------------------------------

/**
 * Returns a fresh mock state with a default user. Callers extend this with
 * test-specific properties and reset in `beforeEach`.
 */
export function defaultMockState() {
  return {
    user: { id: 'user-1' } as MockUser | null,
  }
}

// ---------------------------------------------------------------------------
// 5. tableMock — builds a from() dispatch function from a config map
// ---------------------------------------------------------------------------

/**
 * Build a `from(table)` mock function from a config object.
 *
 * Each key in `config` is a table name; the value is an object whose keys
 * are Supabase method names (select, insert, update, delete, upsert) and
 * whose values are mock implementations.
 *
 * Tables not in the config return an empty object.
 *
 * @example
 * ```ts
 * const from = tableMock({
 *   recipes: {
 *     select: () => ({ eq: () => ({ data: [...], error: null }) }),
 *   },
 *   custom_tags: {
 *     select: () => ({ eq: () => ({ data: [], error: null }) }),
 *   },
 * })
 * ```
 */
export function tableMock(config: TableConfig): (table: string) => TableBehavior {
  return (table: string) => config[table] ?? {}
}

// ---------------------------------------------------------------------------
// 6. defaultGetUser — builds the common auth.getUser mock from a mockState ref
// ---------------------------------------------------------------------------

/**
 * Returns an async function suitable for `auth.getUser` that reads from a
 * `mockState` object with a `user` property. The reference is captured so
 * mutations to `mockState.user` are reflected in later calls.
 *
 * @param mockState  An object with a `user` property (MockUser | null).
 */
export function defaultGetUser(mockState: { user: MockUser | null }) {
  return async () => ({
    data: { user: mockState.user },
    error: mockState.user ? null : { message: 'no user' },
  })
}

// ---------------------------------------------------------------------------
// 7. chainMock — builds a chainable Supabase query mock
// ---------------------------------------------------------------------------

/**
 * Creates a deeply chainable mock that supports any sequence of Supabase
 * query builder methods (.eq(), .in(), .order(), .select(), .single(), etc.).
 *
 * Terminal methods:
 * - `.single()` resolves with `{ data, error }`
 * - Awaiting the chain resolves with `{ data, error }`
 *
 * @param data     The data to resolve with
 * @param error    Optional error to resolve with (default: null)
 */
export function chainMock(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  const terminal = { data, error }

  // All chainable methods return the same chain object
  for (const method of ['eq', 'neq', 'in', 'order', 'select', 'limit', 'gte', 'lte', 'contains', 'is', 'not', 'filter', 'match', 'maybeSingle', 'update', 'delete', 'insert', 'upsert']) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }

  // Terminal methods
  chain.single = vi.fn().mockResolvedValue(terminal)
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal)
  chain.then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve(terminal).then(resolve),
  )

  return chain
}

// ---------------------------------------------------------------------------
// 8. tableMockWithChain — builds a from() dispatch with chainable mocks
// ---------------------------------------------------------------------------

/** Config for tableMockWithChain: maps table names to their resolved data. */
export type ChainTableConfig = Record<string, {
  select?: { data: unknown; error?: unknown }
  insert?: { data: unknown; error?: unknown }
  update?: { data: unknown; error?: unknown }
  delete?: { data: unknown; error?: unknown }
  upsert?: { data: unknown; error?: unknown }
}>

/**
 * Build a `from(table)` mock function where each table method returns
 * a deeply chainable query builder.
 *
 * @example
 * ```ts
 * const from = tableMockWithChain({
 *   recipes: { select: { data: [recipe1, recipe2] } },
 *   custom_tags: { select: { data: [] } },
 * })
 * ```
 */
export function tableMockWithChain(config: ChainTableConfig): (table: string) => Record<string, unknown> {
  return (table: string) => {
    const tableConfig = config[table]
    if (!tableConfig) return chainMock(null)

    const result: Record<string, unknown> = {}
    for (const [method, cfg] of Object.entries(tableConfig)) {
      result[method] = vi.fn().mockReturnValue(chainMock(cfg.data, cfg.error ?? null))
    }
    return result
  }
}
