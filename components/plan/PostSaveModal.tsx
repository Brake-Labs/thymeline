'use client'

import { useRouter } from 'next/navigation'
import { addDays } from '@/lib/date-utils'

interface PostSaveModalProps {
  weekStart: string
  isOpen: boolean
}

export default function PostSaveModal({ weekStart, isOpen }: PostSaveModalProps) {
  const router = useRouter()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full space-y-5">
        <h2 className="font-display text-lg font-semibold text-sage-500">Plan saved!</h2>
        <p className="text-sm text-stone-600">What would you like to do next?</p>
        <div className="space-y-3">
          <button
            onClick={() => router.push(`/groceries?date_from=${weekStart}&date_to=${addDays(weekStart, 6)}`)}
            className="font-display w-full px-4 py-3 bg-sage-500 text-white text-sm font-medium rounded-lg hover:bg-sage-600 transition-colors"
          >
            Make my grocery list
          </button>
          <button
            onClick={() => router.push('/home')}
            className="w-full px-4 py-3 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors"
          >
            Go to home
          </button>
        </div>
      </div>
    </div>
  )
}
