export default function CalendarLoading() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Heading skeleton */}
        <div className="h-8 w-28 bg-stone-200 animate-pulse rounded-lg" />

        {/* Week navigation skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-8 bg-stone-200 animate-pulse rounded" />
          <div className="h-6 w-44 bg-stone-200 animate-pulse rounded" />
          <div className="h-8 w-8 bg-stone-200 animate-pulse rounded" />
        </div>

        {/* Week grid skeleton */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-full bg-stone-200 animate-pulse rounded" />
              <div className="h-28 w-full bg-stone-200 animate-pulse rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
