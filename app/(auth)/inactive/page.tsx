export default function InactivePage() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-100 p-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl" aria-hidden="true">🍴</span>
          <h1 className="font-display text-3xl font-black tracking-tight text-stone-800">Forkcast</h1>
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl font-semibold text-stone-800">Account not active</h2>
          <p className="text-stone-600 text-sm">
            Forkcast is invite-only. Ask for an invite link to get started.
          </p>
        </div>
      </div>
    </div>
  )
}
