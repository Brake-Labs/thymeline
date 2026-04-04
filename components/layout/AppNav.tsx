'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/browser'
import ThymelineLogo from './ThymelineLogo'

const CENTER_NAV = [
  { href: '/home',      label: 'Home' },
  { href: '/recipes',   label: 'Recipes' },
  { href: '/discover',  label: 'Discover' },
  { href: '/plan',      label: 'Planner' },
  { href: '/calendar',  label: 'Calendar' },
  { href: '/groceries', label: 'Groceries' },
]

const MOBILE_NAV = [
  { href: '/home',                  label: 'Home',      icon: '🏠' },
  { href: '/recipes',               label: 'Recipes',   icon: '📖' },
  { href: '/discover',              label: 'Discover',  icon: '🧭' },
  { href: '/plan',                  label: 'Planner',   icon: '📅' },
  { href: '/calendar',              label: 'Calendar',  icon: '🗓️' },
  { href: '/groceries',             label: 'Groceries', icon: '🛒' },
  { href: '/settings/preferences',  label: 'Settings',  icon: '⚙️' },
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
        className="hidden md:flex items-center justify-between px-6 py-3 bg-[#1F2D26]"
      >
        <Link href="/home" className="flex items-center">
          <ThymelineLogo variant="dark" />
        </Link>

        <div className="flex items-center gap-6">
          {CENTER_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'text-white'
                  : 'text-stone-300 hover:text-white'
              }`}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/settings/preferences"
            aria-label="Settings"
            className="text-stone-400 hover:text-stone-200 transition-colors"
          >
            <Settings size={18} />
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm font-medium text-stone-300 hover:text-white transition-colors"
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
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
              isActive(item.href)
                ? 'text-sage-500'
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
