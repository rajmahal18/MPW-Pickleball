import "./globals.css";
import Header from "@/components/Header";
export const metadata = { title: "RVerse Pickleball League", description: "Public tournament hub and live scoring" };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><Header/>{children}<footer className="mt-16 border-t border-line bg-white py-8 text-center text-xs text-gray-500">RVerse Pickleball League MVP · Live public tournament hub</footer></body></html>}
