import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FlashMessage from "@/components/FlashMessage";
import LineupEditor from "@/components/LineupEditor";
import { formatPlayerDisplayName } from "@/lib/player-name";
import StatusBadge from "@/components/StatusBadge";
import { categoriesForStage, categoryLabel } from "@/lib/tournament/rules";
import { nextEditableTeamMatchupId } from "@/lib/tournament/leader-lineup-access";

export const dynamic = "force-dynamic";

export default async function Lineup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEAM_MANAGER" || !user.teamId) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const matchup = await prisma.matchup.findUnique({
    where: { id },
    include: {
      division: true,
      homeTeam: true,
      awayTeam: true,
      lineups: { include: { slots: { include: { pair: { include: { playerA: true, playerB: true } } } } } },
      games: { include: { homePair: true, awayPair: true }, orderBy: { gameNumber: "asc" } },
    },
  });
  if (!matchup || ![matchup.homeTeamId, matchup.awayTeamId].includes(user.teamId)) notFound();

  const [teamPlayers, teamSchedule] = await Promise.all([
    prisma.player.findMany({
      where: { teamId: user.teamId },
      include: { divisionEntries: { where: { divisionId: matchup.divisionId } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.matchup.findMany({
      where: {
        tournamentId: matchup.tournamentId,
        OR: [{ homeTeamId: user.teamId }, { awayTeamId: user.teamId }],
      },
      select: { id: true, status: true, queuePosition: true, order: true, homeTeam: { select: { shortName: true } }, awayTeam: { select: { shortName: true } } },
    }),
  ]);
  const nextEditableId = nextEditableTeamMatchupId(teamSchedule);
  const lineupOpen = nextEditableId === matchup.id;
  const nextEditable = nextEditableId ? teamSchedule.find((item) => item.id === nextEditableId) ?? null : null;
  const current = matchup.lineups.find((lineup) => lineup.teamId === user.teamId);
  const required = matchup.gamesPerMatchup;
  const categories = categoriesForStage(matchup.division, matchup.stage, required);
  const lockedGames = new Map(matchup.games.filter((game) => game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0).map((game) => [game.gameNumber, game]));

  const players = teamPlayers.map((player) => ({
    id: player.id,
    name: formatPlayerDisplayName(player),
    firstName: player.firstName,
    middleInitial: player.middleInitial,
    lastName: player.lastName,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    sex: player.sex,
    eligible: player.isActive
      && player.participationStatus === "CONFIRMED"
      && player.divisionEntries.some((entry) => entry.status === "CONFIRMED"),
  }));

  const slots = Array.from({ length: required }, (_, index) => {
    const slot = index + 1;
    const existing = current?.slots.find((item) => item.slot === slot);
    const game = lockedGames.get(slot);
    const pair = game
      ? (user.teamId === matchup.homeTeamId ? game.homePair : game.awayPair)
      : existing?.pair;
    return {
      slot,
      playerAId: pair?.playerAId || "",
      playerBId: pair?.playerBId || "",
      locked: Boolean(game),
      gameStatus: game?.status ?? null,
    };
  });
  const editableCount = slots.filter((slot) => !slot.locked).length;
  const playersNeeded = required * 2;
  const lockedPlayerIds = new Set(slots.filter((slot) => slot.locked).flatMap((slot) => [slot.playerAId, slot.playerBId]).filter(Boolean));
  const eligibleForFuture = players.filter((player) => player.eligible && !lockedPlayerIds.has(player.id)).length;
  const futurePlayersNeeded = editableCount * 2;

  return <main className="mx-auto max-w-5xl px-4 py-4 md:py-8">
    <FlashMessage {...query}/>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={lineupOpen ? matchup.status : "SCHEDULED"} label={lineupOpen ? undefined : "Lineup locked"}/><span className="label">{matchup.division.name} · lineup</span></div><h1 className="mt-2 text-2xl font-black uppercase sm:text-3xl">{matchup.homeTeam?.name} vs {matchup.awayTeam?.name}</h1><p className="mt-2 hidden max-w-3xl text-sm text-gray-600 md:block">{lineupOpen ? <>Choose the players who will play together in each of the {required} matches. Future slots stay editable until that specific match starts.</> : <>Only your next unfinished matchup in the facilitator's court schedule can be edited.</>}</p></div>
      <Link href="/leader" className="btn-ghost">Back to matchups</Link>
    </div>

    <div className="mt-5 hidden grid-cols-3 gap-3 md:grid">
      <Info label="Matches this matchup" value={String(required)}/>
      <Info label="Players needed" value={String(playersNeeded)}/>
      {lineupOpen ? <Info label="Future slots editable" value={String(editableCount)}/> : <Info label="Lineup access" value="Locked"/>}
    </div>

    {!lineupOpen ? <div className="mt-5 rounded-xl border border-line bg-white p-4 text-sm md:p-5">
      <div className="font-black text-ink">This lineup is not open yet.</div>
      <p className="mt-1 text-gray-600">{nextEditable ? <>Finish <strong>{nextEditable.homeTeam?.shortName || "TBD"} vs {nextEditable.awayTeam?.shortName || "TBD"}</strong> first. This matchup will unlock automatically after the earlier matchup is completed.</> : <>The facilitator has not placed your next unfinished matchup in the court schedule yet.</>}</p>
      {nextEditable && <Link href={`/leader/matchups/${nextEditable.id}`} className="btn-primary mt-3 w-full justify-center sm:w-auto">Open your next lineup</Link>}
    </div> : null}

    {lineupOpen && eligibleForFuture < futurePlayersNeeded ? <div className="mt-6 border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950">Only {eligibleForFuture} eligible unused team member{eligibleForFuture === 1 ? " is" : "s are"} available for {futurePlayersNeeded} open player slot{futurePlayersNeeded === 1 ? "" : "s"}. Ask the admin to confirm attendance/eligibility before saving.</div> : null}
    {lineupOpen && <><div className="mt-5 flex flex-wrap gap-2">{categories.map((category, index) => <span key={index} className="border border-line bg-white px-2.5 py-1.5 text-xs font-black uppercase">Match {index + 1}: {categoryLabel(category)}</span>)}</div>
    {lockedGames.size > 0 && <div className="mt-6 border border-line bg-gray-50 p-4 text-sm text-gray-700"><strong>Only played match slots are protected.</strong> Their player pair stays fixed for historical integrity. Unplayed matches remain editable inside this currently open team matchup.</div>}

    <LineupEditor matchupId={matchup.id} required={required} players={players} slots={slots} categories={categories}/></>}
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border border-line bg-white p-4"><div className="label">{label}</div><div className="mt-1 text-lg font-black">{value}</div></div>;
}
