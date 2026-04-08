import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invites } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'

// Public route — no auth required.
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')

  if (!token) {
    return NextResponse.json({ valid: false })
  }

  try {
    const rows = await db
      .select({ usedBy: invites.usedBy, expiresAt: invites.expiresAt })
      .from(invites)
      .where(eq(invites.token, token))

    const data = dbFirst(rows)

    // Always return 200 with no reason — prevents token state enumeration
    if (!data) {
      return NextResponse.json({ valid: false })
    }

    if (data.usedBy) {
      return NextResponse.json({ valid: false })
    }

    if (new Date(data.expiresAt) <= new Date()) {
      return NextResponse.json({ valid: false })
    }

    return NextResponse.json({ valid: true })
  } catch {
    return NextResponse.json({ valid: false })
  }
}
