import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto grid min-h-[60vh] max-w-2xl place-items-center px-4 py-10">
    <section className="border border-line bg-white p-6 text-center">
      <div className="label">Not found</div>
      <h1 className="mt-2 text-3xl font-black uppercase text-ink">This tournament page is unavailable</h1>
      <p className="mt-2 text-sm text-gray-600">The item may be private, removed, or not yet configured for public viewing.</p>
      <Link href="/" className="btn-primary mt-5 inline-flex">Go to live hub</Link>
    </section>
  </main>;
}
