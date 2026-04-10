/**
 * AsyncLocalStorage-based request context for propagating user ID and
 * feature (route path) through the call chain without modifying every
 * intermediate function signature.
 *
 * withAuth() sets the store; callLLM/callLLMMultimodal reads it for
 * automatic usage tracking.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  userId: string
  feature: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

/** Read the current request context, or null if outside a request. */
export function getRequestContext(): RequestContext | null {
  return requestContext.getStore() ?? null
}

/** Run a function within a request context. */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn)
}
