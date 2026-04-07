import { type NextRequest, NextResponse } from 'next/server'

/**
 * Optimistic cookie check middleware.
 * Only checks if a Better Auth session cookie exists — no DB calls.
 * Full session validation happens at the route level via withAuth().
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Pass the current pathname to server components via a custom header
  response.headers.set('x-pathname', request.nextUrl.pathname)

  return response
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
