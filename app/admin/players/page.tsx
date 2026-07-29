import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import FlashMessage from "@/components/FlashMessage";
import PlayerAvatar from "@/components/PlayerAvatar";

export const dynamic = "force-dynamic";
export default async function AdminPlayers({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await getCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/login");
  const query = await searchParams;
  const players = await prisma.player.findMany({ include: { team: true }, orderBy: [{ team: { shortName: "asc" } }, { firstName: "asc" }] });
  return <main className="mx-auto max-w-7xl px-4 py-8"><AdminNav/><FlashMessage {...query}/><div className="label">Player media</div><h1 className="text-4xl font-black uppercase">Player Avatars</h1><p className="mt-2 text-gray-500">JPEG, PNG, or WebP up to 2 MB. Local EC2 storage requires a persistent AVATAR_STORAGE_DIR; initials remain the fallback.</p><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{players.map((player) => <article key={player.id} className="panel flex items-center gap-4 p-4"><PlayerAvatar {...player} size="lg"/><div className="min-w-0 flex-1"><div className="label">{player.team.shortName} · {player.sex}</div><div className="truncate font-black">{player.displayName || `${player.firstName} ${player.lastName}`}</div><form action={`/api/admin/players/${player.id}/avatar`} method="post" encType="multipart/form-data" className="mt-3 flex gap-2"><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required className="min-w-0 flex-1 text-xs"/><button className="btn-primary px-3 py-1 text-xs">Upload</button></form></div></article>)}</div></main>;
}
