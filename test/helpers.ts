/**
 * Shared test utilities for API route tests.
 *
 * These helpers reduce mock duplication across test files. They provide the
 * OBJECTS that vi.mock() returns — vi.mock() calls must remain in each test
 * file because vitest hoists them.
 *
 * Usage:
 *   import { mockAuth, mockHousehold, makeRequest, defaultMockState } from '@/test/helpers'
 */
import { vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The mock user shape used across tests. */
export interface MockUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

// ---------------------------------------------------------------------------
// 1. mockAuth — returns the factory object for vi.mock('@/lib/auth-server')
// ---------------------------------------------------------------------------

/** The mock session shape returned by getSession. */
export interface MockSession {
  user: MockUser
  session: {
    id: string
    createdAt: Date
    updatedAt: Date
    userId: string
    expiresAt: Date
    token: string
  }
}

/** Build a mock session object from a MockUser. */
export function buildMockSession(user: MockUser): MockSession {
  return {
    user,
    session: {
      id: 'sess-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400000),
      token: 'tok',
    },
  }
}

/**
 * Build the mock module shape for `@/lib/auth-server`.
 *
 * @param getSessionFn  Returns a session object or null.
 */
export function mockAuth(
  getSessionFn: () => Promise<MockSession | null>,
) {
  return {
    auth: {
      api: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session type
        getSession: vi.fn(getSessionFn as any),
      },
    },
  }
}

// ---------------------------------------------------------------------------
// 2. mockDb — returns a mock Drizzle db object
// ---------------------------------------------------------------------------

/**
 * Build a mock db module for vi.mock('@/lib/db').
 *
 * The mock db object supports:
 * - db.select().from().where().orderBy().limit() → returns configured array
 * - db.insert().values().returning() → returns configured array
 * - db.update().set().where().returning() → returns configured array
 * - db.delete().where() → resolves
 * - db.execute() → resolves with configured result
 *
 * @param queryResults  A function that receives the query context and returns result rows.
 *                      If not provided, all queries return empty arrays.
 */
export function mockDb(queryResults?: (ctx: { method: string; table?: string }) => unknown[]) {
  const defaultResults = queryResults ?? (() => [])

  function createChain(method: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {}
    const methods = ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin',
      'leftJoin', 'set', 'values', 'onConflictDoUpdate', 'onConflictDoNothing',
      'returning', 'groupBy', 'having']

    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }

    // Make the chain thenable (awaitable) — resolves with the configured results
    chain.then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => void) => Promise.resolve(defaultResults({ method })).then(resolve),
    )

    return chain
  }

  return {
    db: {
      select: vi.fn(() => createChain('select')),
      insert: vi.fn(() => createChain('insert')),
      update: vi.fn(() => createChain('update')),
      delete: vi.fn(() => createChain('delete')),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    },
  }
}

// ---------------------------------------------------------------------------
// 3. mockHousehold — returns the factory object for vi.mock('@/lib/household')
// ---------------------------------------------------------------------------

interface HouseholdContext {
  resolveHouseholdScope?: (...args: unknown[]) => Promise<{ householdId: string; role: string } | null>
  canManage?: (role: string) => boolean
}

/**
 * Build the mock module shape for `@/lib/household`.
 *
 * By default:
 * - `resolveHouseholdScope` resolves to `null` (solo user).
 * - `canManage` checks for 'owner' or 'co_owner'.
 * - `scopeCondition` returns a mock SQL condition.
 * - `scopeInsert` returns `{ userId }`.
 * - `checkOwnership` returns `{ owned: true }`.
 */
export function mockHousehold(ctx?: HouseholdContext) {
  return {
    resolveHouseholdScope:
      ctx?.resolveHouseholdScope ?? vi.fn().mockResolvedValue(null),
    canManage:
      ctx?.canManage ?? ((role: string) => role === 'owner' || role === 'co_owner'),
    scopeCondition: vi.fn().mockReturnValue({}),
    scopeInsert: vi.fn((userId: string) => ({ userId })),
    checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
  }
}

// ---------------------------------------------------------------------------
// 4. makeRequest — creates a NextRequest with JSON body (no auth header needed)
// ---------------------------------------------------------------------------

/**
 * Create a `NextRequest` suitable for API route handler tests.
 * No Authorization header needed — Better Auth uses cookies.
 *
 * @param method  HTTP method (GET, POST, PATCH, DELETE, etc.)
 * @param url     Full URL string (e.g. 'http://localhost/api/tags')
 * @param body    Optional JSON-serializable body (omit for GET)
 * @param headers Optional extra headers
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
      ...headers,
    },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  return new NextRequest(url, opts)
}

// ---------------------------------------------------------------------------
// 5. defaultMockState — returns a fresh baseline mock state object
// ---------------------------------------------------------------------------

/**
 * Returns a fresh mock state with a default user. Callers extend this with
 * test-specific properties and reset in `beforeEach`.
 */
export function defaultMockState() {
  return {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User', image: null } as MockUser | null,
  }
}

// ---------------------------------------------------------------------------
// 6. defaultGetSession — builds the common auth.api.getSession mock
// ---------------------------------------------------------------------------

/**
 * Returns an async function suitable for `auth.api.getSession` that reads
 * from a `mockState` object. The reference is captured so mutations to
 * `mockState.user` are reflected in later calls.
 *
 * Uses `as any` because Better Auth's getSession return type requires full
 * user/session objects, but test mocks only need minimal fields.
 */
export function defaultGetSession(mockState: { user: MockUser | null }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session type
  return (async () => mockState.user ? buildMockSession(mockState.user) : null) as any
}
