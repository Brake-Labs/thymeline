'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SETTINGS_NAV = [
  { href: '/settings/preferences', label: 'Preferences' },
  { href: '/settings/household',   label: 'Household' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex flex-col w-48 shrink-0 border-r border-gray-200 pt-8 px-4 gap-1">
        {SETTINGS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === item.href || pathname.startsWith(item.href)
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  )
}
