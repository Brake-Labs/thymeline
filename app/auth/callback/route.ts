import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  const redirectTo = new URL('/auth/complete', request.url)
  const response = NextResponse.redirect(redirectTo)

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          },
          remove(name: string, options: Record<string, unknown>) {
            response.cookies.set(name, '', options as Parameters<typeof response.cookies.set>[2])
          },
        },
      },
    )
    // Exchange the OAuth/magic-link code for a session
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Always redirect to /auth/complete — let the client page handle errors
  return response
}
