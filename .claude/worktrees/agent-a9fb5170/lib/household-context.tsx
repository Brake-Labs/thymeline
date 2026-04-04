'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Household, HouseholdMember, HouseholdContext } from '@/types'

interface HouseholdState {
  household: Household | null
  members: HouseholdMember[]
  ctx: HouseholdContext | null
  loading: boolean
  refresh: () => Promise<void>
}

const HouseholdCtx = createContext<HouseholdState>({
  household: null,
  members: [],
  ctx: null,
  loading: true,
  refresh: async () => {},
})

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [ctx, setCtx] = useState<HouseholdContext | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/household').catch(() => null)
      if (!res || !res.ok) {
        setHousehold(null)
        setMembers([])
        setCtx(null)
        setLoading(false)
        return
      }
      const data = await res.json().catch(() => ({ household: null, members: [], myRole: null }))
      setHousehold(data.household ?? null)
      setMembers(data.members ?? [])
      setCtx(
        data.household
          ? { householdId: data.household.id, role: data.myRole }
          : null,
      )
    } catch {
      setHousehold(null)
      setMembers([])
      setCtx(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <HouseholdCtx.Provider value={{ household, members, ctx, loading, refresh }}>
      {children}
    </HouseholdCtx.Provider>
  )
}

export function useHousehold() {
  return useContext(HouseholdCtx)
}
