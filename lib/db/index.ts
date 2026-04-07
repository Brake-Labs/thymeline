/**
 * Singleton Drizzle database client.
 *
 * Uses pg.Pool with explicit configuration to avoid the known issue
 * of excessive idle connections in Next.js dev mode.
 * globalThis singleton prevents pool recreation during hot reloads.
 *
 * Pool and Drizzle instance creation are deferred until the first
 * property access, so that importing this module in test files
 * (which lack DATABASE_URL) does not throw at module-load time.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

type DB = NodePgDatabase<typeof schema> & { $client: Pool }

const globalForDb = globalThis as unknown as { _db: DB | undefined }

function createDb(): DB {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Missing required environment variable: DATABASE_URL')
  }
  const pool = new Pool({
    connectionString,
    max: process.env.NODE_ENV === 'production' ? 20 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  return drizzle(pool, { schema })
}

function getDb(): DB {
  if (!globalForDb._db) {
    globalForDb._db = createDb()
  }
  return globalForDb._db
}

/**
 * Lazy-initialized Drizzle client. The underlying Pool and Drizzle instance
 * are only created on the first property access (select, insert, etc.),
 * not at import time.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real, prop, receiver)
    if (typeof value === 'function') {
      return value.bind(real)
    }
    return value
  },
})
