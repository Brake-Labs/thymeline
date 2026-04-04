export default function PlanWeekLoading() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header with nav arrows skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-8 bg-stone-200 animate-pulse rounded" />
          <div className="h-8 w-48 bg-stone-200 animate-pulse rounded-lg" />
          <div className="h-8 w-8 bg-stone-200 animate-pulse rounded" />
        </div>

        {/* 7-day column layout skeleton */}
        <div className="grid grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-6 w-full bg-stone-200 animate-pulse rounded" />
              <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
                <div className="h-4 w-full bg-stone-200 animate-pulse rounded" />
                <div className="h-4 w-3/4 bg-stone-200 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
