import { prisma } from "@/lib/prisma";
import PlayerAvatar from "@/components/PlayerAvatar";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { formatPlayerDisplayName } from "@/lib/player-name";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function Players({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const query = await searchParams;
  const search = String(query.q || "").trim();
  const pageSize = 48;
  const currentPage = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  const where: Prisma.PlayerWhereInput | null = tournament ? {
      tournamentId: tournament.id,
      isActive: true,
      participationStatus: "CONFIRMED",
      divisionEntries: { some: { status: "CONFIRMED", division: { isPublic: true } } },
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { displayName: { contains: search, mode: "insensitive" as const } },
          { team: { name: { contains: search, mode: "insensitive" as const } } },
          { team: { shortName: { contains: search, mode: "insensitive" as const } } },
        ],
      } : {}),
    } : null;
  const playerInclude = {
    team: { include: { group: true, division: true } },
    divisionEntries: { where: { status: "CONFIRMED" as const, division: { isPublic: true } }, include: { division: true } },
  } satisfies Prisma.PlayerInclude;
  type PlayerRow = Prisma.PlayerGetPayload<{ include: typeof playerInclude }>;
  let players: PlayerRow[] = [];
  let totalPlayers = 0;
  if (where) {
    [players, totalPlayers] = await Promise.all([
      prisma.player.findMany({
      where,
      include: playerInclude,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      }),
      prisma.player.count({ where }),
    ]);
  }
  const totalPages = Math.max(1, Math.ceil(totalPlayers / pageSize));
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (page > 1) params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/players?${suffix}` : "/players";
  };
  if (totalPlayers > 0 && currentPage > totalPages) redirect(pageHref(totalPages));

  return <main className="mx-auto max-w-7xl px-4 py-5 md:py-8"><div className="label">Confirmed tournament participants</div><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-black uppercase md:text-4xl">Players</h1><p className="mt-2 hidden max-w-3xl text-gray-500 md:block">Only confirmed players in public divisions are shown here. Organizers can keep tentative Executive candidates private in the admin player pool until attendance is final.</p></div><span className="border border-court/30 bg-court/10 px-3 py-2 text-xs font-black text-court">{totalPlayers} listed</span></div><form action="/players" className="mt-5 flex max-w-xl flex-wrap gap-2"><label className="min-w-[180px] flex-1"><span className="sr-only">Search players</span><input name="q" defaultValue={search} placeholder="Search player or team" className="w-full border border-line p-3"/></label><button type="submit" className="btn-primary">Search</button>{search && <Link href="/players" className="btn-ghost">Clear</Link>}</form><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{players.map((player) => <article key={player.id} className="panel p-4"><div className="flex items-center gap-3"><PlayerAvatar {...player} size="lg"/><div><div className="label">{player.team?.division.isPublic ? `${player.team.division.name}${player.team.group ? ` - ${player.team.group.name}` : ""} - ${player.team.shortName}` : "Confirmed - assignment TBD"}</div><h2 className="text-lg font-black">{formatPlayerDisplayName(player)}</h2><div className="text-xs font-bold text-gray-500">{player.sex} - Confirmed</div></div></div><div className="mt-4 hidden border-t border-line pt-3 text-sm text-gray-600 md:block">Playing pairs are matchup-specific and may change between rounds.</div><div className="mt-3 flex flex-wrap gap-1">{player.divisionEntries.filter((entry) => entry.status !== "WITHDRAWN").map((entry) => <span key={entry.id} className="border border-line bg-paper px-2 py-1 text-[10px] font-black uppercase">{entry.division.name}: {entry.status}</span>)}</div></article>)}</div>{!players.length && <div className="mt-6 border border-line bg-white p-8 text-center text-gray-500">No confirmed public players match this search.</div>}{totalPages > 1 && <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-line bg-white p-3 text-sm font-bold"><Link href={pageHref(Math.max(1, currentPage - 1))} className={`btn-ghost px-3 py-2 ${currentPage === 1 ? "pointer-events-none opacity-45" : ""}`}>Previous</Link><span className="text-gray-600">Page {currentPage} of {totalPages}</span><Link href={pageHref(Math.min(totalPages, currentPage + 1))} className={`btn-ghost px-3 py-2 ${currentPage >= totalPages ? "pointer-events-none opacity-45" : ""}`}>Next</Link></nav>}</main>;
}
