/**
 * Seeds the allowed_users table from the ALLOWED_EMAILS env var.
 * Idempotent: skips emails that already exist.
 *
 * Usage: npx tsx scripts/seed-allowed-users.ts
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../lib/db/schema'

async function main() {
  const raw = process.env.ALLOWED_EMAILS ?? ''
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (emails.length === 0) {
    console.log('No ALLOWED_EMAILS found in env. Nothing to seed.')
    process.exit(0)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool, { schema })

  console.log(`Seeding ${emails.length} email(s) into allowed_users...`)

  let inserted = 0
  for (const email of emails) {
    try {
      await db
        .insert(schema.allowedUsers)
        .values({ email })
        .onConflictDoNothing({ target: schema.allowedUsers.email })
      inserted++
      console.log(`  + ${email}`)
    } catch (err) {
      console.error(`  ! Failed to insert ${email}:`, err)
    }
  }

  console.log(`Done. Inserted ${inserted}/${emails.length} email(s).`)
  await pool.end()
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
