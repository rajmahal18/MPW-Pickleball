import Link from "next/link";
import { LayoutDashboard, LogIn, LogOut } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import MobileBottomNav from "@/components/MobileBottomNav";

type HeaderUser = { role: "ADMIN" | "TEAM_LEADER" } | null;

export default function Header({ user }: { user: HeaderUser }) {
  const dashboardHref = user?.role === "ADMIN" ? "/admin" : "/leader";

  return <>
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 md:flex md:flex-nowrap md:justify-between md:py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 font-black uppercase tracking-tight">
          <img src="/favicon.png" alt="MPW Pickleball" className="h-8 w-8 object-contain md:h-9 md:w-9"/>
          <span className="truncate text-sm sm:text-base">MPW <span className="text-court">Pickleball</span></span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {user && <Link href={dashboardHref} className="btn-ghost hidden px-3 py-2 text-xs md:inline-flex"><LayoutDashboard size={15}/>Dashboard</Link>}
          {user ? <form action="/api/auth/logout" method="post">
            <button type="submit" className="btn-ghost min-h-10 shrink-0 whitespace-nowrap px-3 py-2 text-xs"><LogOut size={15}/><span>Sign out</span></button>
          </form> : <Link href="/login" className="btn-ghost min-h-10 shrink-0 whitespace-nowrap px-3 py-2 text-xs"><LogIn size={15}/><span>Sign in</span></Link>}
        </div>
        <PublicNav/>
      </div>
    </header>
    {user && <MobileBottomNav dashboardHref={dashboardHref}/>} 
  </>;
}
