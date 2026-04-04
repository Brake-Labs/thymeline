'use client'

interface Props {
  value: number
  onChange: (n: number) => void
}

export default function ServingsScaler({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 text-white text-sm">
      <button
        type="button"
        aria-label="Decrease servings"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
      >
        −
      </button>
      <span className="w-16 text-center text-xs font-medium">{value} servings</span>
      <button
        type="button"
        aria-label="Increase servings"
        onClick={() => onChange(value + 1)}
        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 font-bold"
      >
        +
      </button>
    </div>
  )
}
