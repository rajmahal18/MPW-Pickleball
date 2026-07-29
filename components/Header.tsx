import Link from "next/link";
import { Trophy, Radio, LogIn } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export default async function Header() {
  const user = await getCurrentUser();
  return <header className="border-b border-line bg-white/95 backdrop-blur sticky top-0 z-40">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
      <Link href="/" className="flex items-center gap-3 font-black uppercase tracking-tight">
        <span className="grid h-9 w-9 place-items-center bg-court text-white"><Trophy size={19}/></span>
        <span>RVerse <span className="text-court">Pickleball</span></span>
      </Link>
      <nav className="hidden md:flex items-center gap-5 text-sm font-bold">
        <Link href="/groups/a">Groups</Link><Link href="/bracket">Bracket</Link><Link href="/players">Players</Link>
        <Link href="/" className="flex items-center gap-1 text-red-600"><Radio size={15}/> Live</Link>
      </nav>
      {user ? <Link href={user.role === "ADMIN" ? "/admin" : "/leader"} className="btn-ghost">Dashboard</Link> : <Link href="/login" className="btn-ghost"><LogIn size={15}/> Sign in</Link>}
    </div>
  </header>
}
