import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "RVerse Pickleball Championship",
  description: "Live scores, standings, bracket, Fan Favorite voting, and transparent MVP statistics.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><Header/>{children}<footer className="mt-14 border-t border-line bg-white"><div className="mx-auto max-w-7xl px-4 py-6 text-xs text-gray-500">RVerse Team Pickleball Championship · Live-first tournament operations</div></footer></body></html>;
}
