'use client'

interface CooldownSliderProps {
  value: number
  onChange: (v: number) => void
}

export function cooldownLabel(days: number): string {
  if (days === 7) return '1 week'
  if (days === 14) return '2 weeks'
  if (days === 28) return '1 month'
  if (days === 60) return '2 months'
  return `${days} days`
}

export default function CooldownSlider({ value, onChange }: CooldownSliderProps) {
  return (
    <div className="space-y-3">
      <input
        type="range"
        min={1}
        max={60}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Cooldown days"
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <p className="text-sm font-medium text-gray-700">{cooldownLabel(value)}</p>
    </div>
  )
}
