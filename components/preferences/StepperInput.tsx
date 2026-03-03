'use client'

interface StepperInputProps {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label?: string
}

export default function StepperInput({ value, min, max, onChange, label }: StepperInputProps) {
  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-sm text-gray-600 mr-2">{label}</span>}
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Decrease"
        className="w-11 h-11 flex items-center justify-center rounded-full border border-gray-300 text-xl font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        −
      </button>
      <span className="w-10 text-center text-lg font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Increase"
        className="w-11 h-11 flex items-center justify-center rounded-full border border-gray-300 text-xl font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        +
      </button>
    </div>
  )
}
