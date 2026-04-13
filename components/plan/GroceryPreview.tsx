'use client'

import { ShoppingCart } from 'lucide-react'

interface GroceryPreviewProps {
  confirmedCount: number
  totalDays: number
}

export default function GroceryPreview({ confirmedCount, totalDays }: GroceryPreviewProps) {
  if (confirmedCount === 0) return null

  return (
    <div className="flex items-center gap-2 text-sm text-stone-500">
      <ShoppingCart size={16} className="text-stone-400" />
      <span>
        {confirmedCount} confirmed {confirmedCount === 1 ? 'meal' : 'meals'} from {totalDays} {totalDays === 1 ? 'day' : 'days'}
      </span>
    </div>
  )
}
