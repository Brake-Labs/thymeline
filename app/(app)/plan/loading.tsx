export default function PlanLoading() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Heading skeleton */}
        <div className="h-8 w-36 bg-stone-200 animate-pulse rounded-lg" />

        {/* Setup form skeleton */}
        <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-5">
          <div className="space-y-2">
            <div className="h-4 w-24 bg-stone-200 animate-pulse rounded" />
            <div className="h-10 w-full bg-stone-200 animate-pulse rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-32 bg-stone-200 animate-pulse rounded" />
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-10 w-10 bg-stone-200 animate-pulse rounded-lg" />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 bg-stone-200 animate-pulse rounded" />
            <div className="h-20 w-full bg-stone-200 animate-pulse rounded-lg" />
          </div>
          <div className="h-10 w-40 bg-stone-200 animate-pulse rounded-full" />
        </div>
      </div>
    </div>
  )
}
