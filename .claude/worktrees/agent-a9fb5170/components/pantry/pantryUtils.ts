export const EXPIRY_SOON_DAYS = 3

export function expiryStatus(expiry_date: string | null): 'expired' | 'soon' | 'fresh' | 'none' {
  if (!expiry_date) return 'none'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(expiry_date + 'T00:00:00')
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'expired'
  if (diffDays <= EXPIRY_SOON_DAYS) return 'soon'
  return 'fresh'
}
