import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, SexCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import PlayerAvatar from "@/components/PlayerAvatar";
import { formatPlayerDisplayName } from "@/lib/player-name";

export const dynamic = "force-dynamic";

type PlayerQuery = {
  q?: string;
  page?: string;
  division?: string;
  team?: string;
  sex?: string;
  sort?: string;
};

const SORTS = [
  { value: "first", label: "First name" },
  { value: "last", label: "Last name" },
  { value: "team", label: "Team" },
] as const;

function buildHref(filters: { q: string; division: string; team: string; sex: string; sort: string }, page = 1) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.division) params.set("division", filters.division);
  if (filters.team) params.set("team", filters.team);
  if (filters.sex) params.set("sex", filters.sex);
  if (filters.sort !== "first") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/players?${suffix}` : "/players";
}

export default async function Players({ searchParams }: { searchParams: Promise<PlayerQuery> }) {
  const query = await searchParams;
  const search = String(query.q || "").trim();
  const divisionId = String(query.division || "").trim();
  const teamId = String(query.team || "").trim();
  const sex = query.sex === "MALE" || query.sex === "FEMALE" ? query.sex as SexCategory : "";
  const sort = SORTS.some((option) => option.value === query.sort) ? query.sort! : "first";
  const pageSize = 36;
  const currentPage = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);

  const tournament = await prisma.tournament.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "desc" } });
  if (!tournament) return <main className="public-page mx-auto max-w-7xl px-4 py-8">No published tournament.</main>;

  const divisions = await prisma.division.findMany({
    where: { tournamentId: tournament.id, isPublic: true },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const publicDivisionIds = new Set(divisions.map((division) => division.id));
  const safeDivisionId = divisionId && publicDivisionIds.has(divisionId) ? divisionId : "";
  const publicTeams = await prisma.team.findMany({
    where: { division: { tournamentId: tournament.id, isPublic: true }, ...(safeDivisionId ? { divisionId: safeDivisionId } : {}) },
    select: { id: true, name: true, shortName: true, divisionId: true, division: { select: { name: true } } },
    orderBy: [{ division: { sortOrder: "asc" } }, { shortName: "asc" }],
  });
  const publicTeamIds = new Set(publicTeams.map((team) => team.id));
  const safeTeamId = teamId && publicTeamIds.has(teamId) ? teamId : "";

  const where: Prisma.PlayerWhereInput = {
    tournamentId: tournament.id,
    isActive: true,
    participationStatus: "CONFIRMED",
    divisionEntries: {
      some: {
        status: "CONFIRMED",
        division: { isPublic: true, ...(safeDivisionId ? { id: safeDivisionId } : {}) },
      },
    },
    ...(safeTeamId ? { teamId: safeTeamId } : {}),
    ...(sex ? { sex } : {}),
    ...(search ? {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { team: { name: { contains: search, mode: "insensitive" } } },
        { team: { shortName: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };

  const playerInclude = {
    team: { include: { group: true, division: true } },
    divisionEntries: { where: { status: "CONFIRMED" as const, division: { isPublic: true } }, include: { division: true } },
  } satisfies Prisma.PlayerInclude;
  type PlayerRow = Prisma.PlayerGetPayload<{ include: typeof playerInclude }>;

  const orderBy: Prisma.PlayerOrderByWithRelationInput[] = sort === "last"
    ? [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }]
    : sort === "team"
      ? [{ team: { shortName: "asc" } }, { lastName: "asc" }, { firstName: "asc" }]
      : [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }];

  const [players, totalPlayers] = await Promise.all([
    prisma.player.findMany({
      where,
      include: playerInclude,
      orderBy,
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    }) as Promise<PlayerRow[]>,
    prisma.player.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalPlayers / pageSize));
  const filters = { q: search, division: safeDivisionId, team: safeTeamId, sex, sort };
  if (totalPlayers > 0 && currentPage > totalPages) redirect(buildHref(filters, totalPages));
  const hasFilters = Boolean(search || safeDivisionId || safeTeamId || sex || sort !== "first");

  return <main className="public-page mx-auto max-w-7xl px-4 py-6 md:py-10">
    <section className="public-hero">
      <div>
        <div className="public-kicker">Tournament roster</div>
        <h1 className="public-title">Players</h1>
        <p className="public-lede">Browse confirmed participants across public divisions and teams.</p>
      </div>
      <div className="public-count"><strong>{totalPlayers}</strong><span>players</span></div>
    </section>

    <form action="/players" className="public-filter mt-6 grid gap-3 lg:grid-cols-[minmax(220px,1.6fr)_1fr_1fr_.8fr_.9fr_auto]">
      <label className="min-w-0"><span className="filter-label">Search</span><input name="q" defaultValue={search} placeholder="Player or team" className="filter-control"/></label>
      <label><span className="filter-label">Division</span><select name="division" defaultValue={safeDivisionId} className="filter-control"><option value="">All divisions</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label>
      <label><span className="filter-label">Team</span><select name="team" defaultValue={safeTeamId} className="filter-control"><option value="">All teams</option>{publicTeams.map((team) => <option key={team.id} value={team.id}>{team.shortName} · {team.division.name}</option>)}</select></label>
      <label><span className="filter-label">Category</span><select name="sex" defaultValue={sex} className="filter-control"><option value="">All</option><option value="MALE">Men</option><option value="FEMALE">Women</option></select></label>
      <label><span className="filter-label">Sort</span><select name="sort" defaultValue={sort} className="filter-control">{SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <div className="flex items-end gap-2"><button type="submit" className="btn-primary min-h-11 flex-1 lg:flex-none">Apply</button>{hasFilters && <Link href="/players" className="btn-ghost min-h-11 px-3">Clear</Link>}</div>
    </form>

    {players.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {players.map((player) => {
        const teamIsPublic = Boolean(player.team?.division.isPublic);
        return <article key={player.id} className="public-card group">
          <div className="flex items-center gap-3.5">
            <PlayerAvatar {...player} size="lg"/>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-extrabold tracking-tight text-ink md:text-lg">{formatPlayerDisplayName(player)}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-gray-500">
                <span>{player.sex === "MALE" ? "Men" : "Women"}</span>
                <span aria-hidden="true">·</span>
                <span className="text-court">Confirmed</span>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-line/80 pt-3">
            {teamIsPublic && player.team
              ? <><div className="text-sm font-extrabold text-ink">{player.team.name}</div><div className="mt-1 text-xs font-medium text-gray-500">{player.team.division.name}{player.team.group ? ` · ${player.team.group.name}` : ""}</div></>
              : <div className="text-sm font-semibold text-gray-500">Team assignment pending</div>}
          </div>
        </article>;
      })}
    </div> : <div className="public-empty mt-6">No confirmed players match these filters.</div>}

    {totalPages > 1 && <nav className="mt-7 flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3 text-sm font-bold shadow-sm">
      <Link href={buildHref(filters, Math.max(1, currentPage - 1))} className={`btn-ghost px-3 py-2 ${currentPage === 1 ? "pointer-events-none opacity-45" : ""}`}>Previous</Link>
      <span className="text-gray-500">Page {currentPage} of {totalPages}</span>
      <Link href={buildHref(filters, Math.min(totalPages, currentPage + 1))} className={`btn-ghost px-3 py-2 ${currentPage >= totalPages ? "pointer-events-none opacity-45" : ""}`}>Next</Link>
    </nav>}
  </main>;
}
