import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/household
// Returns the user's household and member list, or { household: null } if the
// user is solo or if migration 017 (household tables) has not run.
// Never hangs — any DB error is caught and returns a safe fallback.
export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Look up the user's household membership.
    // If household_members table doesn't exist (migration 017 not run),
    // Supabase returns an error rather than throwing — we handle it below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: membership, error: memberErr } = await (supabase as any)
      .from('household_members')
      .select('household_id, role')
      .eq('user_id', user.id)
      .single()

    if (memberErr || !membership) {
      // Not in a household, or table doesn't exist
      return NextResponse.json({ household: null })
    }

    const { household_id, role } = membership as { household_id: string; role: string }

    // Fetch household details
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: household, error: householdErr } = await (supabase as any)
      .from('households')
      .select('id, name, owner_id, created_at')
      .eq('id', household_id)
      .single()

    if (householdErr || !household) {
      console.error('[GET /api/household] household row missing for id:', household_id, householdErr)
      return NextResponse.json({ household: null })
    }

    // Fetch all members for the household
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: members, error: membersErr } = await (supabase as any)
      .from('household_members')
      .select('user_id, role, joined_at')
      .eq('household_id', household_id)

    if (membersErr) {
      console.error('[GET /api/household] failed to fetch members:', membersErr)
    }

    return NextResponse.json({
      household: {
        ...(household as object),
        role,
        members: members ?? [],
      },
    })
  } catch (err) {
    // Catch-all: table doesn't exist, network error, etc.
    // Return safe fallback so the settings page renders "No household" instead of hanging.
    console.error('[GET /api/household] unexpected error:', err)
    return NextResponse.json({ household: null })
  }
}
