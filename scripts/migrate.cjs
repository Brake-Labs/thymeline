/**
 * Lightweight migration runner for production Docker builds.
 * Uses pg directly — no drizzle-kit needed at runtime.
 * Reads migration SQL files from drizzle/ and applies them in order.
 */
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'drizzle')

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // Create tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `)

    // Read journal to get migration order
    const journal = JSON.parse(
      fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')
    )

    // Get already-applied migrations
    const { rows } = await pool.query('SELECT hash FROM "__drizzle_migrations"')
    const applied = new Set(rows.map((r) => r.hash))

    // Apply pending migrations in order
    for (const entry of journal.entries) {
      if (applied.has(entry.tag)) continue

      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, `${entry.tag}.sql`),
        'utf8'
      )
      await pool.query(sql)
      await pool.query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [entry.tag, Date.now()]
      )
      console.log(`Applied migration: ${entry.tag}`)
    }

    console.log('Migrations complete')
  } finally {
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
