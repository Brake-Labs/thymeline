export default function RecipeDetailLoading() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Title skeleton */}
        <div className="h-8 w-2/3 bg-stone-200 animate-pulse rounded-lg" />

        {/* Meta row skeleton */}
        <div className="flex gap-3">
          <div className="h-6 w-20 bg-stone-200 animate-pulse rounded-full" />
          <div className="h-6 w-20 bg-stone-200 animate-pulse rounded-full" />
          <div className="h-6 w-24 bg-stone-200 animate-pulse rounded-full" />
        </div>

        {/* Details block skeleton */}
        <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4">
          <div className="h-5 w-28 bg-stone-200 animate-pulse rounded" />
          <div className="space-y-2">
            {['w-3/4', 'w-5/6', 'w-2/3', 'w-4/5', 'w-3/4', 'w-5/6'].map((w, i) => (
              <div key={i} className={`h-4 bg-stone-200 animate-pulse rounded ${w}`} />
            ))}
          </div>
        </div>

        {/* Notes skeleton */}
        <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-3">
          <div className="h-5 w-16 bg-stone-200 animate-pulse rounded" />
          <div className="h-4 w-full bg-stone-200 animate-pulse rounded" />
          <div className="h-4 w-3/4 bg-stone-200 animate-pulse rounded" />
        </div>
      </div>
    </div>
  )
}
