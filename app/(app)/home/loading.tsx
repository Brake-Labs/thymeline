export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Greeting skeleton */}
        <div className="h-8 w-48 bg-stone-200 animate-pulse rounded-lg" />

        {/* This Week section skeleton */}
        <div className="space-y-4">
          <div className="h-4 w-24 bg-stone-200 animate-pulse rounded" />
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-4">
            <div className="h-10 bg-stone-200 animate-pulse rounded-lg" />
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-24 bg-stone-200 animate-pulse rounded-lg" />
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions skeleton */}
        <div className="space-y-4">
          <div className="h-4 w-28 bg-stone-200 animate-pulse rounded" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-stone-200 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>

        {/* Recently Made skeleton */}
        <div className="space-y-4">
          <div className="h-4 w-32 bg-stone-200 animate-pulse rounded" />
          <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-4 flex items-center justify-between">
                <div className="h-4 w-40 bg-stone-200 animate-pulse rounded" />
                <div className="h-4 w-16 bg-stone-200 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
