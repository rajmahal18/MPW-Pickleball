"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto grid min-h-[60vh] max-w-2xl place-items-center px-4 py-10">
    <section className="border border-line bg-white p-6 text-center">
      <div className="label text-flame">Temporary problem</div>
      <h1 className="mt-2 text-3xl font-black uppercase text-ink">Page could not load</h1>
      <p className="mt-2 text-sm text-gray-600">Please try again. If the tournament is live, scores and votes remain protected by the server.</p>
      <button type="button" onClick={reset} className="btn-primary mt-5">Retry</button>
    </section>
  </main>;
}
