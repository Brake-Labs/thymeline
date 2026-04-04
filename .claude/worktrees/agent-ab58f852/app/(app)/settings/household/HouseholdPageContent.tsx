'use client'

import { useState } from 'react'
import { useHousehold } from '@/lib/household-context'

export function HouseholdPageContent() {
  const { household, members, ctx, loading, refresh } = useHousehold()
  const [householdName, setHouseholdName] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) {
    return <div className="p-6 text-sm text-stone-500">Loading…</div>
  }

  // ── Solo user — no household yet ─────────────────────────────────────────
  if (!household) {
    return (
      <div className="p-6 max-w-lg space-y-6">
        <h1 className="text-xl font-semibold">Household</h1>
        <p className="text-sm text-stone-600">
          Create a household to share recipes, meal plans, pantry, and grocery lists with family or housemates.
        </p>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-stone-700">
            Household name
            <input
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="e.g. The Smiths"
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy || !householdName.trim()}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                const res = await fetch('/api/household', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: householdName.trim() }),
                })
                if (!res.ok) {
                  const d = await res.json()
                  setError(d.error ?? 'Failed to create household')
                } else {
                  await refresh()
                }
              } finally {
                setBusy(false)
              }
            }}
            className="rounded-md bg-sage-500 px-4 py-2 text-sm font-medium text-white hover:bg-sage-600 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create household'}
          </button>
        </div>
      </div>
    )
  }

  const isOwnerOrCoOwner = ctx?.role === 'owner' || ctx?.role === 'co_owner'

  // ── Household member view ────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{household.name}</h1>
        {ctx?.role && (
          <span className="text-xs text-stone-500 capitalize">{ctx.role.replace('_', ' ')}</span>
        )}
      </div>

      {/* Members list */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-stone-700">Members</h2>
        <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{m.display_name ?? m.email ?? m.user_id}</p>
                <p className="text-xs text-stone-500 capitalize">{m.role.replace('_', ' ')}</p>
              </div>
              {/* Remove member — owner/co_owner only, cannot remove owner */}
              {isOwnerOrCoOwner && m.role !== 'owner' && ctx?.role === 'owner' && (
                <button
                  onClick={async () => {
                    if (!confirm('Remove this member?')) return
                    await fetch(`/api/household/members/${m.user_id}`, { method: 'DELETE' })
                    await refresh()
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Invite link */}
      {isOwnerOrCoOwner && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">Invite someone</h2>
          {inviteUrl ? (
            <div className="space-y-2">
              <input
                readOnly
                value={inviteUrl}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm bg-stone-50"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <p className="text-xs text-stone-500">Share this link — it expires in 7 days and can only be used once.</p>
            </div>
          ) : (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  const res = await fetch('/api/household/invite', { method: 'POST' })
                  if (res.ok) {
                    const d = await res.json()
                    setInviteUrl(d.invite_url)
                  } else {
                    const d = await res.json()
                    setError(d.error ?? 'Failed to generate invite')
                  }
                } finally {
                  setBusy(false)
                }
              }}
              className="rounded-md bg-sage-500 px-4 py-2 text-sm font-medium text-white hover:bg-sage-600 disabled:opacity-50"
            >
              {busy ? 'Generating…' : 'Generate invite link'}
            </button>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>
      )}

      {/* Leave household */}
      {ctx?.role !== 'owner' && (
        <section>
          <button
            onClick={async () => {
              if (!confirm('Leave this household? Your data will stay in the household.')) return
              const res = await fetch('/api/household/members/me', { method: 'DELETE' })
              if (res.ok) {
                await refresh()
              }
            }}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Leave household
          </button>
        </section>
      )}

      {/* Delete household — owner only */}
      {ctx?.role === 'owner' && (
        <section>
          <button
            onClick={async () => {
              if (!confirm('Delete this household? This cannot be undone.')) return
              const res = await fetch('/api/household', { method: 'DELETE' })
              if (res.ok) {
                await refresh()
              }
            }}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Delete household
          </button>
        </section>
      )}
    </div>
  )
}
