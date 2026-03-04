import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public route — no auth required. Uses service anon key directly.
function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')

  if (!token) {
    return NextResponse.json({ valid: false, reason: 'Token not found' })
  }

  const supabase = createAnonClient()
  const { data, error } = await supabase
    .from('invites')
    .select('used_by, expires_at')
    .eq('token', token)
    .single()

  // Always return 200 — never 404 for missing tokens (avoids enumeration)
  if (error || !data) {
    return NextResponse.json({ valid: false, reason: 'Token not found' })
  }

  if (data.used_by) {
    return NextResponse.json({ valid: false, reason: 'Already used' })
  }

  if (new Date(data.expires_at) <= new Date()) {
    return NextResponse.json({ valid: false, reason: 'Expired' })
  }

  return NextResponse.json({ valid: true })
}
