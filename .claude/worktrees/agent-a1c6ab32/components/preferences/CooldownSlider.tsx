'use client'

interface CooldownSliderProps {
  value: number
  onChange: (v: number) => void
}

export function cooldownLabel(days: number): string {
  if (days === 7)  return '1 week'
  if (days === 14) return '2 weeks'
  if (days === 30 || days === 31) return '1 month'
  if (days === 60) return '2 months'
  return `${days} days`
}

const TICKS: { value: number; label: string; edge?: 'left' | 'right' }[] = [
  { value: 1,  label: '1 day',    edge: 'left' },
  { value: 7,  label: '1 week' },
  { value: 14, label: '2 weeks' },
  { value: 30, label: '1 month' },
  { value: 60, label: '2 months', edge: 'right' },
]

const MIN = 1
const MAX = 60

function pct(v: number) {
  return ((v - MIN) / (MAX - MIN)) * 100
}

export default function CooldownSlider({ value, onChange }: CooldownSliderProps) {
  return (
    <div className="space-y-2">
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Cooldown days"
        className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-sage-500"
      />

      {/* Tick labels — edge ticks pinned left/right to avoid clipping */}
      <div className="relative h-4">
        {TICKS.map((tick) => (
          <span
            key={tick.value}
            style={
              tick.edge === 'left'  ? { left: 0 } :
              tick.edge === 'right' ? { right: 0 } :
              { left: `${pct(tick.value)}%`, transform: 'translateX(-50%)' }
            }
            className="absolute font-sans text-[10px] text-stone-400 whitespace-nowrap"
          >
            {tick.label}
          </span>
        ))}
      </div>

      {/* Live label */}
      <p className="font-display font-medium text-[13px] text-sage-900">{cooldownLabel(value)}</p>
    </div>
  )
}
