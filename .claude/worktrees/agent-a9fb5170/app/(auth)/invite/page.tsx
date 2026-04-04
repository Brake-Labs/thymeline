import { redirect } from 'next/navigation'

interface InvitePageProps {
  searchParams: { token?: string }
}

async function validateToken(token: string): Promise<{ valid: boolean; reason?: string }> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/invite/validate?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    })
    return res.json()
  } catch {
    return { valid: false, reason: 'Could not validate token' }
  }
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const token = searchParams.token ?? ''

  if (!token) {
    // No token at all — show generic error
    return <InviteError reason="No invite token provided." />
  }

  const result = await validateToken(token)

  if (result.valid) {
    redirect(`/login?invite=${encodeURIComponent(token)}`)
  }

  return <InviteError reason={result.reason} />
}

function InviteError({ reason }: { reason?: string }) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-100 p-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl" aria-hidden="true">🍴</span>
          <h1 className="font-display text-3xl font-black tracking-tight text-stone-800">Thymeline</h1>
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-stone-800">Invite link invalid</h2>
          <p className="text-stone-600 text-sm">
            {reason ?? 'This invite link is invalid or has expired. Ask for a new one.'}
          </p>
        </div>
      </div>
    </div>
  )
}
