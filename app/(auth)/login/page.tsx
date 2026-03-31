'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { getSupabaseClient } from '@/lib/supabase/browser'

// Google "G" SVG icon
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading-magic' | 'loading-google' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const invite = searchParams.get('invite')
    if (invite) {
      sessionStorage.setItem('thymeline_invite_token', invite)
    }
  }, [searchParams])

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setState('loading-magic')
    setErrorMsg('')
    const supabase = getSupabaseClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    })
    if (error) {
      setErrorMsg(error.message)
      setState('error')
    } else {
      setState('sent')
    }
  }

  async function handleGoogle() {
    setState('loading-google')
    setErrorMsg('')
    const supabase = getSupabaseClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    })
    if (error) {
      setErrorMsg(error.message)
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-lg bg-sage-50 border border-sage-200 px-6 py-5 text-center">
        <p className="text-sage-700 font-medium">
          {"Check your email — we sent you a sign-in link."}
        </p>
      </div>
    )
  }

  const busy = state === 'loading-magic' || state === 'loading-google'

  return (
    <form onSubmit={handleMagicLink} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 placeholder-stone-400 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="font-display w-full rounded-lg bg-sage-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sage-600 disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {state === 'loading-magic' && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        )}
        Send me a link
      </button>

      {state === 'error' && (
        <p className="text-red-600 text-sm">{errorMsg}</p>
      )}

      <div className="relative flex items-center gap-3">
        <div className="flex-1 border-t border-stone-200" />
        <span className="text-xs text-stone-400 uppercase tracking-wide">or</span>
        <div className="flex-1 border-t border-stone-200" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60 flex items-center justify-center gap-3"
      >
        {state === 'loading-google' ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />
        ) : (
          <GoogleIcon />
        )}
        Continue with Google
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen bg-stone-50 flex items-center justify-center px-4"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d6d3d1' fill-opacity='0.3'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E\")",
      }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-100 p-8 space-y-6">
        {/* Wordmark */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl" aria-hidden="true">🍴</span>
            <h1 className="font-display text-3xl font-black tracking-tight text-stone-800">Thymeline</h1>
          </div>
          <p className="text-stone-500 text-sm">Your AI-powered meal planning assistant</p>
        </div>

        <Suspense fallback={<div className="h-40 animate-pulse bg-stone-100 rounded-lg" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
