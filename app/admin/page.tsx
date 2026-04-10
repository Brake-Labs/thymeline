'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface UserRow {
  id: string
  name: string
  email: string
  image: string | null
  createdAt: string
  recipeCount: number
  tokensLast7d: number
  status: 'active' | 'disabled'
}

interface Stats {
  totalUsers: number
  totalRecipes: number
  tokensLast7d: number
  activeAllowedUsers: number
}

interface UsageByFeature {
  feature: string
  totalTokens: number
}

interface UsageByUser {
  userId: string | null
  userName: string | null
  totalTokens: number
}

type Tab = 'users' | 'usage'
type DateRange = '7d' | '30d' | 'all'

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [usageByFeature, setUsageByFeature] = useState<UsageByFeature[]>([])
  const [usageByUser, setUsageByUser] = useState<UsageByUser[]>([])
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const [usersRes, statsRes] = await Promise.all([
          fetch('/api/admin/users'),
          fetch('/api/admin/stats'),
        ])

        if (!usersRes.ok || !statsRes.ok) {
          setError('Failed to load admin data')
          return
        }

        const usersData = await usersRes.json()
        const statsData = await statsRes.json()
        setUsers(usersData.users)
        setStats(statsData)
      } catch {
        setError('Failed to load admin data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (tab !== 'usage') return
    async function loadUsage() {
      try {
        const res = await fetch(`/api/admin/usage?range=${dateRange}`)
        if (!res.ok) {
          setError('Failed to load usage data')
          return
        }
        const data = await res.json()
        setUsageByFeature(data.byFeature ?? [])
        setUsageByUser(data.byUser ?? [])
      } catch {
        setError('Failed to load usage data')
      }
    }
    loadUsage()
  }, [tab, dateRange])

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviteStatus(null)
    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      if (res.status === 409) {
        setInviteStatus('Email already exists')
        return
      }
      if (!res.ok) {
        setInviteStatus('Failed to invite')
        return
      }
      setInviteStatus(`Invited ${inviteEmail.trim()}`)
      setInviteEmail('')
      // Refresh users list
      const usersRes = await fetch('/api/admin/users')
      if (usersRes.ok) {
        const data = await usersRes.json()
        setUsers(data.users)
      }
    } catch {
      setInviteStatus('Failed to invite')
    }
  }

  async function handleToggleUser(userId: string, currentStatus: string) {
    const action = currentStatus === 'disabled' ? 'enable' : 'disable'
    try {
      const res = await fetch(`/api/admin/users/${userId}/${action}`, { method: 'POST' })
      if (!res.ok) {
        setError(`Failed to ${action} user`)
        return
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, status: action === 'disable' ? 'disabled' : 'active' } : u,
        ),
      )
    } catch {
      setError(`Failed to ${action} user`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-500">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-3">{error}</p>
          <button
            onClick={() => { setError(null); window.location.reload() }}
            className="text-sm text-stone-600 hover:text-stone-900 underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const maxFeatureTokens = Math.max(...usageByFeature.map((f) => f.totalTokens), 1)

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/home" className="text-stone-400 hover:text-stone-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
          <h1 className="text-2xl font-bold text-stone-900">Admin</h1>
        </div>

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Users" value={stats.totalUsers} />
            <StatCard label="Recipes Created" value={stats.totalRecipes} />
            <StatCard label="Tokens (7d)" value={formatNumber(stats.tokensLast7d)} />
            <StatCard label="Allowed Users" value={stats.activeAllowedUsers} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-stone-200 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'users' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setTab('usage')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'usage' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Token Usage
          </button>
        </div>

        {/* Users Tab */}
        {tab === 'users' && (
          <div>
            {/* Invite */}
            <div className="flex gap-2 mb-6">
              <input
                type="email"
                placeholder="Email to invite..."
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                className="px-3 py-2 border border-stone-300 rounded-lg text-sm flex-1 max-w-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleInvite}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                Invite User
              </button>
              {inviteStatus && (
                <span className="self-center text-sm text-stone-600">{inviteStatus}</span>
              )}
            </div>

            {/* Users table */}
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-left py-3 px-4 font-medium text-stone-600">User</th>
                    <th className="text-left py-3 px-4 font-medium text-stone-600">Joined</th>
                    <th className="text-right py-3 px-4 font-medium text-stone-600">Recipes</th>
                    <th className="text-right py-3 px-4 font-medium text-stone-600">Tokens (7d)</th>
                    <th className="text-center py-3 px-4 font-medium text-stone-600">Status</th>
                    <th className="text-center py-3 px-4 font-medium text-stone-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {u.image ? (
                            <img
                              src={u.image}
                              alt=""
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-medium text-stone-600">
                              {u.name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-stone-900">{u.name}</div>
                            <div className="text-stone-500 text-xs">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-stone-600">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right text-stone-900">{u.recipeCount}</td>
                      <td className="py-3 px-4 text-right text-stone-900">
                        {formatNumber(u.tokensLast7d)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleUser(u.id, u.status)}
                          className={`text-xs px-3 py-1 rounded-md font-medium ${
                            u.status === 'active'
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {u.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Usage Tab */}
        {tab === 'usage' && (
          <div>
            {/* Date range filter */}
            <div className="flex gap-2 mb-6">
              {(['7d', '30d', 'all'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    dateRange === r
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {r === 'all' ? 'All time' : `Last ${r}`}
                </button>
              ))}
            </div>

            {/* By Feature */}
            <div className="bg-white rounded-xl border border-stone-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-stone-900 mb-4">Usage by Feature</h2>
              {usageByFeature.length === 0 ? (
                <p className="text-stone-500 text-sm">No usage data for this period.</p>
              ) : (
                <div className="space-y-3">
                  {usageByFeature.map((f) => (
                    <div key={f.feature} className="flex items-center gap-3">
                      <div className="w-40 text-sm text-stone-700 truncate">{f.feature}</div>
                      <div className="flex-1 bg-stone-100 rounded-full h-6 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-300"
                          style={{ width: `${(f.totalTokens / maxFeatureTokens) * 100}%` }}
                        />
                      </div>
                      <div className="w-24 text-right text-sm text-stone-600">
                        {formatNumber(f.totalTokens)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By User */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="text-lg font-semibold text-stone-900 mb-4">Usage by User</h2>
              {usageByUser.length === 0 ? (
                <p className="text-stone-500 text-sm">No usage data for this period.</p>
              ) : (
                <div className="bg-white rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-200">
                        <th className="text-left py-2 font-medium text-stone-600">User</th>
                        <th className="text-right py-2 font-medium text-stone-600">Total Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageByUser.map((u) => (
                        <tr key={u.userId ?? 'unknown'} className="border-b border-stone-100 last:border-0">
                          <td className="py-2 text-stone-900">{u.userName ?? u.userId ?? 'Unknown'}</td>
                          <td className="py-2 text-right text-stone-600">{formatNumber(u.totalTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="text-sm text-stone-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-stone-900">{value}</div>
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
