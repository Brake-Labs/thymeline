export default function RecipeEditLoading() {
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Heading skeleton */}
        <div className="h-8 w-40 bg-stone-200 animate-pulse rounded-lg" />

        {/* Form field skeletons */}
        <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-20 bg-stone-200 animate-pulse rounded" />
              <div className="h-10 w-full bg-stone-200 animate-pulse rounded-lg" />
            </div>
          ))}
          <div className="space-y-2">
            <div className="h-4 w-16 bg-stone-200 animate-pulse rounded" />
            <div className="h-24 w-full bg-stone-200 animate-pulse rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
