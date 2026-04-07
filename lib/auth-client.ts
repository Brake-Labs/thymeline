/**
 * Better Auth browser client.
 * Sessions are cookie-based — no manual token management.
 */
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
})
