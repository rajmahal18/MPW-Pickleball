export default function AdminLoading() {
  return <main className="admin-shell" aria-busy="true" aria-live="polite">
    <div className="mb-6 h-16 animate-pulse border border-line bg-white" />
    <div className="h-3 w-40 animate-pulse bg-line" />
    <div className="mt-3 h-10 w-80 max-w-full animate-pulse bg-line" />
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse border border-line bg-white" />)}
    </div>
    <div className="mt-6 h-80 animate-pulse border border-line bg-white" />
    <p className="mt-3 text-xs font-bold text-gray-500">Loading admin workspace…</p>
  </main>;
}
