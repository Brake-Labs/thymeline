'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/browser'

interface NavItem {
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/home',                  label: 'Home',     icon: '🏠' },
  { href: '/recipes',               label: 'Recipes',  icon: '📖' },
  { href: '/plan',                  label: 'Plan',     icon: '📅' },
  { href: '/settings/preferences',  label: 'Settings', icon: '⚙️' },
]

export default function AppNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/home' && pathname.startsWith(href))
  }

  return (
    <>
      {/* Desktop top nav */}
      <nav
        aria-label="Main navigation"
        className="hidden md:flex items-center justify-between px-6 py-3 border-b border-stone-200 bg-white"
      >
        <Link href="/home" className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">🍴</span>
          <span className="text-xl font-black tracking-tight text-stone-800">Forkcast</span>
        </Link>

        <div className="flex items-center gap-6">
          {NAV_ITEMS.slice(1).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'text-emerald-700'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-stone-200 bg-white"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
              isActive(item.href)
                ? 'text-emerald-700'
                : 'text-stone-500 hover:text-stone-800'
            }`}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            <span className="text-lg leading-none" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={handleSignOut}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors"
        >
          <span className="text-lg leading-none" aria-hidden="true">👋</span>
          <span>Sign out</span>
        </button>
      </nav>

      {/* Mobile bottom nav spacer */}
      <div className="md:hidden h-16" aria-hidden="true" />
    </>
  )
}
