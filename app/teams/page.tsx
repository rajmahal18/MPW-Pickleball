import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeStandings, isTerminalMatchupStatus } from "@/lib/tournament/standings";
import { formatPlayerCompactName, formatPlayerDisplayName } from "@/lib/player-name";
import { TeamIdentity } from "@/components/TeamIdentity";
import { teamCardStyle } from "@/lib/team-branding";
import EventTabs from "@/components/EventTabs";
import { publicDivisionFilter } from "@/lib/public-preview";

export const dynamic = "force-dynamic";

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ division?: string }> }) {
  const query = await searchParams;
  const divisionFilter = await publicDivisionFilter();
  const tournament = await prisma.tournament.findFirst({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
    include: {
      divisions: {
        where: divisionFilter,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          groups: {
            orderBy: { name: "asc" },
            include: { standingOverrides: { select: { teamId: true, position: true } } },
          },
          teams: {
            orderBy: [{ group: { name: "asc" } }, { groupPosition: "asc" }, { shortName: "asc" }],
            include: {
              group: true,
              players: {
                where: { isActive: true, participationStatus: "CONFIRMED" },
                include: { divisionEntries: { where: { status: "CONFIRMED" }, select: { divisionId: true } } },
                orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
              },
              pairs: { where: { isActive: true }, include: { playerA: true, playerB: true } },
            },
          },
          matchups: {
            where: { stage: "GROUP" },
            include: { games: { select: { homeScore: true, awayScore: true, status: true } } },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!tournament) return <main className="public-page mx-auto max-w-7xl px-4 py-6">No published tournament.</main>;
  const selectedDivision = tournament.divisions.find((division) => division.slug === query.division || division.id === query.division) ?? tournament.divisions[0] ?? null;
  const divisions = selectedDivision ? [selectedDivision] : [];
  const totalTeams = selectedDivision?.teams.length ?? 0;
  const totalGroups = selectedDivision?.groups.filter((group) => selectedDivision.teams.some((team) => team.groupId === group.id)).length ?? 0;
  const pairMode = selectedDivision?.entrantType === "PAIR";
  const showDivisionHeading = false;

  return <main className="public-page mx-auto max-w-7xl px-4 py-3 md:py-10">
    <section className="public-hero">
      <div>
        <div className="public-kicker">Tournament field</div>
        <h1 className="public-title">{pairMode ? "Pairs" : "Teams"}</h1>
        <div className="mt-1.5 text-xs font-bold text-gray-500 md:mt-2 md:text-sm">{totalTeams} {pairMode ? `pair${totalTeams === 1 ? "" : "s"}` : `team${totalTeams === 1 ? "" : "s"}`}{totalGroups ? ` · ${totalGroups} group${totalGroups === 1 ? "" : "s"}` : ""}</div>
      </div>
    </section>
    <EventTabs divisions={tournament.divisions} activeId={selectedDivision?.id ?? ""} basePath="/teams"/>

    {divisions.length ? <div className="mt-4 space-y-8 md:mt-7 md:space-y-10">
      {divisions.map((division) => {
        const groupBlocks = division.groups.map((group) => {
          const teams = division.teams.filter((team) => team.groupId === group.id);
          const groupMatchups = division.matchups.filter((matchup) => matchup.groupLabel === group.name);
          const standings = teams.length ? computeStandings(teams, groupMatchups, group.standingOverrides) : [];
          const standingByTeam = new Map(standings.map((row) => [row.team.id, row]));
          return { id: group.id, name: group.name, slug: group.slug, teams, groupMatchups, standingByTeam };
        }).filter((group) => group.teams.length > 0);
        const unassigned = division.teams.filter((team) => !team.groupId);

        return <section key={division.id}>
          {showDivisionHeading && <div className="public-section-heading mb-4"><div><div className="public-kicker">Division</div><h2 className="text-xl font-black md:text-2xl">{division.name}</h2></div><span className="text-xs font-bold text-gray-500">{division.teams.length} teams</span></div>}

          {groupBlocks.length ? <div className="grid gap-4 lg:grid-cols-2 md:gap-5">
            {groupBlocks.map((group) => <section key={group.id} className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-gray-50/70 px-3 py-2.5 md:px-4 md:py-3">
                <div>{showDivisionHeading && <div className="public-kicker">{division.name}</div>}<h2 className="text-lg font-black md:text-xl"><Link href={`/groups/${group.slug}`} className="hover:text-court">{group.name}</Link></h2></div>
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{group.teams.length} team{group.teams.length === 1 ? "" : "s"}</span>
              </div>
              <div className="space-y-2 p-2.5 md:p-3">
                {group.teams.map((team) => {
                  const players = division.entrantType === "PAIR" && team.pairs[0] ? [team.pairs[0].playerA, team.pairs[0].playerB] : team.players.filter((player) => player.divisionEntries.some((entry) => entry.divisionId === division.id));
                  const standing = group.standingByTeam.get(team.id);
                  const decided = group.groupMatchups.filter((matchup) => isTerminalMatchupStatus(matchup.status) && (matchup.homeTeamId === team.id || matchup.awayTeamId === team.id));
                  const matchupWins = decided.filter((matchup) => matchup.winnerTeamId === team.id).length;
                  const matchupLosses = decided.filter((matchup) => matchup.winnerTeamId && matchup.winnerTeamId !== team.id).length;
                  return <TeamRow key={team.id} team={team} players={players} compactNames={division.entrantType === "PAIR"} rankLabel={standing?.rankLabel ?? null} matchupWins={matchupWins} matchupLosses={matchupLosses}/>;
                })}
              </div>
            </section>)}
          </div> : null}

          {unassigned.length > 0 && <section className="mt-4 overflow-hidden rounded-xl border border-dashed border-line bg-white/80">
            <div className="border-b border-line px-3 py-2.5"><div className="public-kicker">Awaiting group</div><h2 className="text-lg font-black">Unassigned {division.entrantType === "PAIR" ? "pairs" : "teams"}</h2></div>
            <div className="grid gap-2 p-2.5 md:grid-cols-2">{unassigned.map((team) => {
              const players = division.entrantType === "PAIR" && team.pairs[0] ? [team.pairs[0].playerA, team.pairs[0].playerB] : team.players.filter((player) => player.divisionEntries.some((entry) => entry.divisionId === division.id));
              return <TeamRow key={team.id} team={team} players={players} compactNames={division.entrantType === "PAIR"} rankLabel={null} matchupWins={0} matchupLosses={0}/>;
            })}</div>
          </section>}

          {!groupBlocks.length && !unassigned.length && <div className="public-empty">No public entrants are configured in this event yet.</div>}
        </section>;
      })}
    </div> : <div className="public-empty mt-4 md:mt-6">No public events are configured right now.</div>}
  </main>;
}

function TeamRow({
  team,
  players,
  compactNames,
  rankLabel,
  matchupWins,
  matchupLosses,
}: {
  team: { id: string; name: string; shortName: string; logoUrl: string | null; brandingPrimary: string | null; brandingSecondary: string | null; brandingAccent: string | null; brandingText: string | null; brandingSurface: string | null };
  players: Array<{ firstName: string; middleInitial: string | null; lastName: string; displayName: string | null; avatarUrl: string | null }>;
  compactNames: boolean;
  rankLabel: string | null;
  matchupWins: number;
  matchupLosses: number;
}) {
  const hasResults = matchupWins + matchupLosses > 0;
  return <Link href={`/teams/${team.id}`} style={teamCardStyle(team)} className="group flex min-w-0 items-center gap-3 rounded-lg border p-3 transition hover:-translate-y-px hover:shadow-sm md:p-3.5">
    {compactNames
      ? <div className="min-w-0 max-w-[58%] font-black leading-tight text-ink">{players.map(formatPlayerCompactName).join(" / ") || team.shortName}</div>
      : <TeamIdentity team={team} variant="standard" link={false} className="max-w-[58%]"/>}
    <div className="min-w-0 flex-1">
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-gray-500 md:text-xs">
        <span className="font-black uppercase tracking-wide text-gray-400">{team.shortName}</span>
        <span>{players.length} player{players.length === 1 ? "" : "s"}</span>
        {hasResults && rankLabel && <span className="font-black text-court">Rank {rankLabel} · {matchupWins}–{matchupLosses}</span>}
      </div>
      {players.length > 0 && <div className="mt-2 flex items-center">
        <div className="flex -space-x-1.5">{players.slice(0, 4).map((player, index) => <MiniAvatar key={`${team.id}-${index}`} player={player} compact={compactNames}/>)}</div>
        {players.length > 4 && <span className="ml-2 text-[10px] font-bold text-gray-400">+{players.length - 4}</span>}
      </div>}
    </div>
    <span className="shrink-0 text-lg font-black text-court/40 transition group-hover:translate-x-0.5 group-hover:text-court" aria-hidden="true">→</span>
  </Link>;
}

function MiniAvatar({ player, compact }: { player: { firstName: string; middleInitial: string | null; lastName: string; displayName: string | null; avatarUrl: string | null }; compact: boolean }) {
  const name = compact ? formatPlayerCompactName(player) : formatPlayerDisplayName(player);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return player.avatarUrl
    ? <img src={player.avatarUrl} alt="" title={name} className="h-7 w-7 rounded-full border-2 border-white bg-paper object-cover" loading="lazy"/>
    : <span title={name} className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-court/10 text-[8px] font-black text-court">{initials || "?"}</span>;
}
