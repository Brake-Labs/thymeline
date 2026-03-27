import { expiryStatus } from './pantryUtils'

interface ExpiryBadgeProps {
  expiry_date: string | null
}

export default function ExpiryBadge({ expiry_date }: ExpiryBadgeProps) {
  const status = expiryStatus(expiry_date)
  if (status === 'none' || status === 'fresh') return null

  if (status === 'expired') {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const exp = new Date(expiry_date! + 'T00:00:00')
    const diffDays = Math.abs(Math.floor((exp.getTime() - today.getTime()) / 86400000))
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600">
        Expired {diffDays} day{diffDays !== 1 ? 's' : ''} ago
      </span>
    )
  }

  // status === 'soon'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiry_date! + 'T00:00:00')
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / 86400000)
  const label = diffDays === 0 ? 'Expires today' : `Expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}`

  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
      {label}
    </span>
  )
}
