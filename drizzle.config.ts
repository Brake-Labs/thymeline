import { defineConfig } from 'drizzle-kit'
import { loadEnvConfig } from '@next/env'

// Load .env.local (same way Next.js does)
loadEnvConfig(process.cwd())

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
