import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPlayerFullName } from "@/lib/player-name";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

type ScorecardSearch = {
  round?: string;
  court?: string;
  game?: string;
};

function clean(value: string | undefined, fallback: string, max = 80) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return (normalized || fallback).slice(0, max);
}

function formatGeneratedAt(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function withQuery(id: string, query: ScorecardSearch, game?: number) {
  const params = new URLSearchParams();
  if (query.round?.trim()) params.set("round", query.round.trim());
  if (query.court?.trim()) params.set("court", query.court.trim());
  if (game) params.set("game", String(game));
  const suffix = params.toString();
  return `/admin/matches/${id}/scorecards${suffix ? `?${suffix}` : ""}`;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export default async function MatchScorecardsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ScorecardSearch> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");

  const { id } = await params;
  const query = await searchParams;
  const matchup = await prisma.matchup.findUnique({
    where: { id },
    select: {
      id: true,
      groupLabel: true,
      stage: true,
      roundLabel: true,
      courtLabel: true,
      gamesPerMatchup: true,
      status: true,
      tournament: { select: { name: true, season: true } },
      division: { select: { name: true, slug: true } },
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true, shortName: true } },
      awayTeam: { select: { name: true, shortName: true } },
      lineups: { select: { teamId: true, updatedAt: true, slots: { select: { slot: true, pairId: true } } } },
      games: {
        orderBy: { gameNumber: "asc" },
        select: {
          id: true,
          gameNumber: true,
          status: true,
          homeScore: true,
          awayScore: true,
          winnerTeamId: true,
          homePairId: true,
          awayPairId: true,
          homePair: { select: { label: true, playerA: { select: { firstName: true, middleInitial: true, lastName: true } }, playerB: { select: { firstName: true, middleInitial: true, lastName: true } } } },
          awayPair: { select: { label: true, playerA: { select: { firstName: true, middleInitial: true, lastName: true } }, playerB: { select: { firstName: true, middleInitial: true, lastName: true } } } },
        },
      },
    },
  });
  if (!matchup) notFound();

  const homeLineup = matchup.homeTeamId ? matchup.lineups.find((lineup) => lineup.teamId === matchup.homeTeamId) : null;
  const awayLineup = matchup.awayTeamId ? matchup.lineups.find((lineup) => lineup.teamId === matchup.awayTeamId) : null;
  const homeSubmitted = Boolean(homeLineup && homeLineup.slots.length === matchup.gamesPerMatchup);
  const awaySubmitted = Boolean(awayLineup && awayLineup.slots.length === matchup.gamesPerMatchup);
  const completeGames = matchup.games.length === matchup.gamesPerMatchup;
  const homeBySlot = new Map(homeLineup?.slots.map((slot) => [slot.slot, slot.pairId]) ?? []);
  const awayBySlot = new Map(awayLineup?.slots.map((slot) => [slot.slot, slot.pairId]) ?? []);
  const gamesMatchLatestLineups = completeGames && matchup.games.every((game) => homeBySlot.get(game.gameNumber) === game.homePairId && awayBySlot.get(game.gameNumber) === game.awayPairId);
  const ready = Boolean(matchup.homeTeam && matchup.awayTeam && homeSubmitted && awaySubmitted && gamesMatchLatestLineups);

  const baseRoundLabel = matchup.stage === "GROUP" && matchup.groupLabel && !matchup.roundLabel.toLowerCase().includes(matchup.groupLabel.toLowerCase())
    ? `${matchup.groupLabel} ${matchup.roundLabel}`
    : matchup.roundLabel;
  const roundLabel = clean(query.round, baseRoundLabel, 80);
  const courtLabel = clean(query.court, matchup.courtLabel || "", 40);
  const requestedGame = Number.parseInt(String(query.game || ""), 10);
  const selectedGames = Number.isInteger(requestedGame) && requestedGame > 0
    ? matchup.games.filter((game) => game.gameNumber === requestedGame)
    : matchup.games;
  const printablePages = chunks(selectedGames, 2);
  const generatedAt = formatGeneratedAt(new Date());

  return <main className="scorecard-preview-shell">
    <section className="no-print mb-5 border border-line bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label text-court">Official paper scorecards</div>
          <h1 className="text-2xl font-black uppercase md:text-3xl">{matchup.homeTeam?.name || "TBD"} vs {matchup.awayTeam?.name || "TBD"}</h1>
          <p className="mt-1 text-sm text-gray-600">{matchup.division.name} - {matchup.gamesPerMatchup} pair match{matchup.gamesPerMatchup === 1 ? "" : "es"}. Two landscape scorecards print top-and-bottom on each A4 portrait sheet, ready for a crosswise cut.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="btn-ghost">Back to admin</Link>
          {query.game && <Link href={withQuery(id, query)} className="btn-ghost">Show all cards</Link>}
          <PrintButton label={query.game ? `Print match ${query.game}` : "Print all scorecards"} className="btn-primary" />
        </div>
      </div>

      <form method="get" className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
        {query.game && <input type="hidden" name="game" value={query.game} />}
        <label><span className="label">Round</span><input name="round" defaultValue={roundLabel} className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold" /></label>
        <label><span className="label">Court</span><input name="court" defaultValue={courtLabel} placeholder="Leave blank if handwritten" className="mt-1 w-full border border-line bg-white p-3 text-sm font-bold" /></label>
        <button className="btn-ghost" type="submit">Update preview</button>
      </form>

      {!ready && <div className="mt-4 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <strong>Scorecards are not ready yet.</strong> Home lineup: {homeSubmitted ? "complete" : "waiting/incomplete"}; away lineup: {awaySubmitted ? "complete" : "waiting/incomplete"}; generated matches: {matchup.games.length}/{matchup.gamesPerMatchup}; lineup/match sync: {gamesMatchLatestLineups ? "current" : "waiting"}. Matches and scorecards become ready after both valid lineups are saved.
      </div>}
      {ready && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="border border-court/30 bg-court/10 px-2 py-1 font-black uppercase text-court">Ready to print</span>
        <span>Printing always reflects the latest submitted lineups. Reprint affected cards after any lineup change.</span>
      </div>}
    </section>

    {ready && selectedGames.length > 0 ? <>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {matchup.games.map((game) => <Link key={game.id} href={withQuery(id, query, game.gameNumber)} className={`btn-ghost px-3 py-2 text-xs ${requestedGame === game.gameNumber ? "border-court text-court" : ""}`}>Match {game.gameNumber}</Link>)}
      </div>
      <section className="scorecard-print-root">
        {printablePages.map((pageGames, pageIndex) => <div key={pageIndex} className={`scorecard-print-page ${pageGames.length === 1 ? "scorecard-print-page-single" : ""}`}>
          {pageGames.map((game) => <Scorecard
            key={game.id}
            tournament={`${matchup.tournament.name}${matchup.tournament.season ? ` - ${matchup.tournament.season}` : ""}`}
            division={matchup.division.name}
            round={roundLabel}
            court={courtLabel}
            generatedAt={generatedAt}
            homeTeamId={matchup.homeTeamId!}
            awayTeamId={matchup.awayTeamId!}
            homeTeam={matchup.homeTeam!.name}
            awayTeam={matchup.awayTeam!.name}
            homeShort={matchup.homeTeam!.shortName}
            awayShort={matchup.awayTeam!.shortName}
            game={game}
          />)}
        </div>)}
      </section>
    </> : ready ? <div className="no-print border border-amber-300 bg-amber-50 p-5 font-bold text-amber-950">The requested match number does not exist for this matchup. <Link className="underline" href={withQuery(id, query)}>Show all scorecards.</Link></div> : null}
  </main>;
}

type PrintableGame = {
  gameNumber: number;
  status: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  homePair: { label: string; playerA: { firstName: string; middleInitial: string | null; lastName: string }; playerB: { firstName: string; middleInitial: string | null; lastName: string } };
  awayPair: { label: string; playerA: { firstName: string; middleInitial: string | null; lastName: string }; playerB: { firstName: string; middleInitial: string | null; lastName: string } };
};

function Scorecard({ tournament, division, round, court, generatedAt, homeTeamId, awayTeamId, homeTeam, awayTeam, homeShort, awayShort, game }: {
  tournament: string;
  division: string;
  round: string;
  court: string;
  generatedAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: string;
  awayTeam: string;
  homeShort: string;
  awayShort: string;
  game: PrintableGame;
}) {
  const hasScore = game.status !== "SCHEDULED" || game.homeScore !== 0 || game.awayScore !== 0;
  const homeForfeitWin = game.status === "FORFEITED" && game.winnerTeamId === homeTeamId;
  const awayForfeitWin = game.status === "FORFEITED" && game.winnerTeamId === awayTeamId;
  const reference = [division, round, `Match ${game.gameNumber}`].filter(Boolean).join(" - ");
  return <article className="scorecard-card">
    <header className="scorecard-card-header">
      <div className="scorecard-tournament">{tournament}</div>
      <div className="scorecard-title">OFFICIAL MATCH SCORECARD</div>
      <div className="scorecard-meta-grid">
        <Meta label="Round" value={round} />
        <Meta label="Match No." value={String(game.gameNumber)} />
        <Meta label="Court" value={court} />
        <Meta label="Starting time" value="" />
        <Meta label="Ending time" value="" />
      </div>
    </header>

    <div className="scorecard-teams">
      <TeamScoreBox
        team={homeTeam}
        short={homeShort}
        pairLabel={game.homePair.label}
        player1={formatPlayerFullName(game.homePair.playerA)}
        player2={formatPlayerFullName(game.homePair.playerB)}
        score={hasScore ? String(game.homeScore) : ""}
        forfeitChecked={homeForfeitWin}
      />
      <TeamScoreBox
        team={awayTeam}
        short={awayShort}
        pairLabel={game.awayPair.label}
        player1={formatPlayerFullName(game.awayPair.playerA)}
        player2={formatPlayerFullName(game.awayPair.playerB)}
        score={hasScore ? String(game.awayScore) : ""}
        forfeitChecked={awayForfeitWin}
      />
    </div>

    <div className="scorecard-signatures">
      <Signature label="Team Representative" />
      <Signature label="Team Representative" />
    </div>
    <div className="scorecard-umpire"><Signature label="Match Umpire" /></div>
    <footer className="scorecard-reference"><span>{reference}</span><span>Generated {generatedAt}</span></footer>
  </article>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="scorecard-meta"><span>{label}:</span><strong>{value}</strong></div>;
}

function TeamScoreBox({ team, short, pairLabel, player1, player2, score, forfeitChecked }: { team: string; short: string; pairLabel: string; player1: string; player2: string; score: string; forfeitChecked: boolean }) {
  return <section className="scorecard-team-box">
    <div className="scorecard-team-name"><span>Team Name:</span><strong>{team}</strong></div>
    <div className="scorecard-pair-note">{short} - {pairLabel}</div>
    <Line label="Player 1" value={player1} />
    <Line label="Player 2" value={player2} />
    <div className="scorecard-forfeit"><span className="scorecard-checkbox">{forfeitChecked ? "X" : ""}</span> Win by Default / Forfeit</div>
    <div className="scorecard-final-score"><strong>Final Score:</strong><span>{score}</span></div>
  </section>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="scorecard-line"><span>{label}:</span><strong>{value}</strong></div>;
}

function Signature({ label }: { label: string }) {
  return <div className="scorecard-signature"><div className="scorecard-signature-line"/><div>{label}</div><em>(Signature above printed name)</em></div>;
}
