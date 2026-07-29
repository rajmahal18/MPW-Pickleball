import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser(); if (user) redirect(user.role === "ADMIN" ? "/admin" : "/leader");
  const query = await searchParams;
  return <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 py-10"><section className="panel w-full p-6"><div className="label">Authorized tournament operations</div><h1 className="text-3xl font-black uppercase">Sign in</h1><p className="mt-2 text-sm text-gray-500">Admin and team-leader accounts only. Public users do not need an account.</p>{query.error && <div className="mt-4 border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">{query.error}</div>}<form action="/api/auth/login" method="post" className="mt-5 space-y-4"><label className="block"><span className="label">Email</span><input type="email" name="email" required autoComplete="email" className="mt-1 w-full border border-line p-3"/></label><label className="block"><span className="label">Password</span><input type="password" name="password" required minLength={6} autoComplete="current-password" className="mt-1 w-full border border-line p-3"/></label><button className="btn-primary w-full">Sign in</button></form></section></main>;
}
