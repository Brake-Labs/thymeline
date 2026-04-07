/**
 * Seeds the database with a dev user and default preferences.
 * Used with DEV_BYPASS_AUTH=true for local testing without Google OAuth.
 *
 * Usage: npx tsx scripts/seed-dev.ts
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as schema from '../lib/db/schema'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })

  const userId = process.env.DEV_BYPASS_AUTH_USER_ID ?? 'dev-user'
  const email = process.env.DEV_BYPASS_AUTH_EMAIL ?? 'dev@localhost'

  // Upsert Better Auth user record
  const existingUser = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1)

  if (existingUser.length === 0) {
    await db.insert(schema.user).values({
      id: userId,
      name: 'Dev User',
      email,
      emailVerified: true,
    })
    console.log(`Created user: ${userId} (${email})`)
  } else {
    console.log(`User already exists: ${userId}`)
  }

  // Upsert preferences
  const existingPrefs = await db
    .select({ id: schema.userPreferences.id })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1)

  if (existingPrefs.length === 0) {
    await db.insert(schema.userPreferences).values({
      userId,
      onboardingCompleted: true,
      isActive: true,
    })
    console.log('Created default preferences')
  } else {
    console.log('Preferences already exist')
  }

  await pool.end()
  console.log('Done!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
