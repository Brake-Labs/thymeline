export default function RecipesLoading() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header + search skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-36 bg-stone-200 animate-pulse rounded-lg" />
          <div className="h-10 w-32 bg-stone-200 animate-pulse rounded-full" />
        </div>
        <div className="h-10 w-full bg-stone-200 animate-pulse rounded-lg" />

        {/* Recipe card grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
              <div className="h-5 w-3/4 bg-stone-200 animate-pulse rounded" />
              <div className="h-4 w-1/2 bg-stone-200 animate-pulse rounded" />
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-stone-200 animate-pulse rounded-full" />
                <div className="h-6 w-16 bg-stone-200 animate-pulse rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
