interface ConfidenceBarProps {
  score: number // 0-4
}

export default function ConfidenceBar({ score }: ConfidenceBarProps) {
  const clamped = Math.max(0, Math.min(4, Math.round(score)))
  return (
    <div className="flex gap-0.5" aria-label={`Confidence: ${clamped} out of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-3 h-1.5 rounded-sm ${i < clamped ? 'bg-sage-500' : 'bg-stone-200'}`}
        />
      ))}
    </div>
  )
}
