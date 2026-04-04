'use client'

import { useMemo } from 'react'

function getPhrase(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export default function GreetingHeading({ userName }: { userName: string }) {
  const phrase = useMemo(() => getPhrase(new Date().getHours()), [])
  return (
    <h1 className="font-display text-3xl font-bold text-stone-900">
      Good {phrase}{userName ? `, ${userName}` : ''}
    </h1>
  )
}
