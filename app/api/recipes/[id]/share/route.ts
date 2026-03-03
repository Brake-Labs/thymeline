import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

interface RouteContext {
  params: { id: string }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Ownership check
  const { data: existing, error: fetchError } = await supabase
    .from('recipes')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { is_shared?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.is_shared !== 'boolean') {
    return NextResponse.json({ error: 'is_shared must be a boolean' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('recipes')
    .update({ is_shared: body.is_shared })
    .eq('id', params.id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}
