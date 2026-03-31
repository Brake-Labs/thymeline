export default function PantryLoading() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Heading skeleton */}
        <div className="h-8 w-28 bg-stone-200 animate-pulse rounded-lg" />

        {/* Sectioned list skeleton */}
        {Array.from({ length: 3 }).map((_, s) => (
          <div key={s} className="space-y-3">
            <div className="h-5 w-24 bg-stone-200 animate-pulse rounded" />
            <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div className="h-4 w-36 bg-stone-200 animate-pulse rounded" />
                  <div className="h-4 w-16 bg-stone-200 animate-pulse rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
