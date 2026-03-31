/**
 * Centralized environment variable configuration.
 * Validates required env vars at import time so failures happen early.
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  supabase: {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },
  llm: { apiKey: process.env.LLM_API_KEY },
  firecrawl: { apiKey: process.env.FIRECRAWL_API_KEY },
  admin: { userId: process.env.ADMIN_USER_ID },
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
}
