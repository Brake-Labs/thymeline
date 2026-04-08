'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const SETTINGS_NAV = [
  { href: '/settings/preferences', label: 'Preferences' },
  { href: '/settings/household',   label: 'Household' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => setEmail(data.user?.email ?? null))
      .catch(() => {})
  }, [])

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex flex-col w-48 shrink-0 border-r border-stone-200 pt-8 px-4 gap-1">
        {SETTINGS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === item.href || pathname.startsWith(item.href)
                ? 'bg-stone-100 text-stone-900'
                : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
            }`}
          >
            {item.label}
          </Link>
        ))}

        {email && (
          <div className="mt-auto pb-6 px-3">
            <p className="text-xs text-stone-400">Signed in as</p>
            <p className="text-xs text-stone-600 truncate" title={email}>{email}</p>
          </div>
        )}
      </aside>
      <div className="flex-1">
        {email && (
          <div className="md:hidden px-4 pt-4 pb-2">
            <p className="text-xs text-stone-400">Signed in as <span className="text-stone-600">{email}</span></p>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
