import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { config } from '@/lib/config'

export const GET = withAuth(async (req, { user }) => {
  const allowed = config.allowedEmails
  if (allowed.length === 0) {
    // No whitelist configured — open access
    return NextResponse.json({ allowed: true })
  }
  const isAllowed = allowed.includes(user.email.toLowerCase())
  return NextResponse.json({ allowed: isAllowed })
})
