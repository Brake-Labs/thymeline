import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { entry_id: string } },
) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entry_id } = params
  const db = createAdminClient()

  // Look up the entry and verify ownership via join on meal_plans
  const { data: entry } = await db
    .from('meal_plan_entries')
    .select('id, meal_plan_id, meal_plans(user_id)')
    .eq('id', entry_id)
    .maybeSingle()

  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  const ownerId = ((entry.meal_plans as unknown) as { user_id: string } | null)?.user_id
  if (ownerId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await db
    .from('meal_plan_entries')
    .delete()
    .eq('id', entry_id)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
