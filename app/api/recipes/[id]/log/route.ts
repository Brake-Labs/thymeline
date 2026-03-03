import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

interface RouteContext {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the recipe exists and the user can access it (RLS enforces shared/owned)
  const { data: recipe, error: fetchError } = await supabase
    .from('recipes')
    .select('id')
    .eq('id', params.id)
    .single()

  if (fetchError || !recipe) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const today = new Date().toISOString().split('T')[0]

  const { error: insertError } = await supabase
    .from('recipe_history')
    .insert({ recipe_id: params.id, user_id: user.id, made_on: today })

  // Unique constraint violation = already logged today — treat as idempotent
  const alreadyLogged =
    insertError !== null &&
    (insertError.code === '23505' || insertError.message.includes('recipe_history_unique_day'))

  if (insertError && !alreadyLogged) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ made_on: today, already_logged: alreadyLogged })
}
