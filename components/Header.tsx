import Link from "next/link";
import { Radio, LogIn } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export default async function Header() {
  const user = await getCurrentUser();
  return <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3"><Link href="/" className="flex shrink-0 items-center gap-3 font-black uppercase tracking-tight"><img src="/favicon.png" alt="MPW Pickleball" className="h-9 w-9 object-contain"/><span className="hidden sm:inline">MPW <span className="text-court">Pickleball</span></span></Link><nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-xs font-bold md:gap-5 md:text-sm"><Link href="/groups/a">Groups</Link><Link href="/bracket">Bracket</Link><Link href="/players">Players</Link><Link href="/fan-favorite">Fan Favorite</Link><Link href="/mvp">MVP</Link><Link href="/" className="flex items-center gap-1 text-flame"><Radio size={15}/> <span className="hidden sm:inline">Live</span></Link></nav>{user ? <Link href={user.role === "ADMIN" ? "/admin" : "/leader"} className="btn-ghost shrink-0 px-3 py-2 text-xs">Dashboard</Link> : <Link href="/login" className="btn-ghost shrink-0 px-3 py-2 text-xs"><LogIn size={15}/><span className="hidden sm:inline">Sign in</span></Link>}</div></header>;
}
