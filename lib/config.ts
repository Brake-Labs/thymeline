/**
 * Centralized environment variable configuration.
 *
 * Uses getters so that env vars are validated on first access, not at
 * import time. This allows `next build` to succeed without all env vars
 * set (they're only needed at runtime).
 */

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  get database() {
    return { url: requireEnv('DATABASE_URL') }
  },
  get auth() {
    return {
      secret: requireEnv('BETTER_AUTH_SECRET'),
      google: {
        clientId: requireEnv('GOOGLE_CLIENT_ID'),
        clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
      },
    }
  },
  /** Comma-separated list of allowed emails. Empty = open access. */
  get allowedEmails(): string[] {
    return (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  },
  llm: { apiKey: process.env.LLM_API_KEY },
  firecrawl: { apiKey: process.env.FIRECRAWL_API_KEY },
  admin: { userId: process.env.ADMIN_USER_ID },
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
}
