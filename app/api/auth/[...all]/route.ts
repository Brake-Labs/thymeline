/**
 * Better Auth catch-all route handler.
 * Handles all auth endpoints: sign-in, sign-out, session, OAuth callbacks.
 */
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth-server'

export const { POST, GET } = toNextJsHandler(auth)
