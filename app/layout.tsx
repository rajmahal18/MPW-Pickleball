import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import MobileBottomNav from "@/components/MobileBottomNav";
import PublicMotion from "@/components/PublicMotion";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "MPW Pickleball Championship",
  description: "Live scores, standings, bracket, Fan Favorite voting, and transparent MVP statistics.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  return <html lang="en"><body className={user ? "pb-24 md:pb-0" : undefined}><Header user={user}/><PublicMotion/>{children}{user && <MobileBottomNav dashboardHref={user.role === "TEAM_MANAGER" ? "/leader" : "/admin"}/>}<footer className="mt-14 border-t border-line bg-white"><div className="mx-auto max-w-7xl px-4 py-6 text-xs text-gray-500">MPW Dink and Dash Pickleball Tournament · Tournament operations</div></footer></body></html>;
}
