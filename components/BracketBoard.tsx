import Link from "next/link";
import type { MatchupStage, Prisma } from "@prisma/client";
import { displayStatus } from "@/components/StatusBadge";
import { winsNeededForMatchup } from "@/lib/tournament/rules";
import { Crown } from "lucide-react";
import { TeamLogo } from "@/components/TeamIdentity";
import { sourceDisplayOrder } from "@/lib/tournament/knockout-progression";
import { formatPlayerCompactName, type PlayerNameParts } from "@/lib/player-name";

const PROGRESSION_STAGES = ["ROUND_OF_16", "QUARTERFINAL", "SEMIFINAL", "FINAL"] as const;
export const KNOCKOUT_STAGES = [...PROGRESSION_STAGES, "THIRD_PLACE"] as const;
const STAGE_LABELS: Record<(typeof KNOCKOUT_STAGES)[number], string> = {
  ROUND_OF_16: "Round of 16",
  QUARTERFINAL: "Quarterfinals",
  SEMIFINAL: "Semifinals",
  FINAL: "Grand Final",
  THIRD_PLACE: "Battle for 3rd",
};

type BaseBracketMatchup = Prisma.MatchupGetPayload<{
  include: { homeTeam: true; awayTeam: true; winnerTeam: true };
}>;

type BracketTeam = NonNullable<BaseBracketMatchup["homeTeam"]> & {
  pairs?: Array<{ playerA: PlayerNameParts; playerB: PlayerNameParts }>;
};

export type BracketMatchup = Omit<BaseBracketMatchup, "homeTeam" | "awayTeam" | "winnerTeam"> & {
  homeTeam: BracketTeam | null;
  awayTeam: BracketTeam | null;
  winnerTeam: BracketTeam | null;
};

export default function BracketBoard({ matchups, pairMode = false, championship = true }: { matchups: BracketMatchup[]; pairMode?: boolean; championship?: boolean }) {
  const rawStageRows = PROGRESSION_STAGES
    .map((stage) => ({ stage, rows: matchups.filter((matchup) => matchup.stage === stage).sort((a, b) => a.order - b.order) }))
    .filter((entry) => entry.rows.length > 0);
  const stageRows = rawStageRows.map((entry, index) => ({
    ...entry,
    rows: orderRowsForDownstream(entry.rows, rawStageRows[index + 1]?.rows ?? [], pairMode ? "STANDARD" : "CROSSED"),
  }));
  const thirdPlaceRows = matchups.filter((matchup) => matchup.stage === "THIRD_PLACE").sort((a, b) => a.order - b.order);
  const mobilePreFinalRows = stageRows.filter((entry) => entry.stage !== "FINAL");
  const mobileFinalRows = stageRows.filter((entry) => entry.stage === "FINAL");
  const gridTemplate = stageRows.flatMap((_, index) => index < stageRows.length - 1 ? ["minmax(260px, 1fr)", "72px"] : ["minmax(260px, 1fr)"]);

  const MobileStage = ({ entry }: { entry: (typeof stageRows)[number] }) => <section key={entry.stage}>
    <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-black uppercase">{!championship && entry.stage === "FINAL" ? "Wildcard Final" : STAGE_LABELS[entry.stage]}</h3><span className="text-[10px] font-bold uppercase text-gray-400">{entry.rows.length} matchup{entry.rows.length === 1 ? "" : "s"}</span></div>
    <div className="space-y-2">{entry.rows.map((matchup) => <BracketCard key={matchup.id} matchup={matchup} pairMode={pairMode} championship={championship} />)}</div>
  </section>;

  return <>
    <div className="space-y-5 p-3 md:hidden">
      {mobilePreFinalRows.map((entry) => <MobileStage key={entry.stage} entry={entry} />)}
      {thirdPlaceRows.length > 0 && <section>
        <div className="mb-2"><div className="label text-amber-800">Semifinal consolation</div><h3 className="text-sm font-black uppercase">Battle for 3rd</h3></div>
        <div className="space-y-2">{thirdPlaceRows.map((matchup) => <BracketCard key={matchup.id} matchup={matchup} pairMode={pairMode} championship={championship} bronze />)}</div>
      </section>}
      {mobileFinalRows.map((entry) => <MobileStage key={entry.stage} entry={entry} />)}
    </div>
    <div className="bracket-scroll hidden md:block">
    <div className="bracket-progression-grid" style={{ gridTemplateColumns: gridTemplate.join(" ") }}>
      {stageRows.map((entry, stageIndex) => {
        const next = stageRows[stageIndex + 1];
        return <div key={entry.stage} className="contents">
          <section className="bracket-column">
            <div className="bracket-stage-title">{!championship && entry.stage === "FINAL" ? "Wildcard Final" : STAGE_LABELS[entry.stage]}</div>
            <div className="bracket-stage-stack">
              {entry.rows.map((matchup, index) => <div key={matchup.id} className="bracket-positioned-card" style={{ top: `${((index + 0.5) / entry.rows.length) * 100}%` }}>
                <BracketCard matchup={matchup} pairMode={pairMode} championship={championship} />
              </div>)}
            </div>
          </section>
          {next && <BracketConnector source={entry.rows} target={next.rows} />}
        </div>;
      })}
    </div>

    {thirdPlaceRows.length > 0 && <section className="bracket-third-place-section">
      <div className="bracket-third-place-heading">
        <div><div className="label text-amber-800">Semifinal consolation</div><h3 className="text-lg font-black uppercase">Battle for 3rd</h3></div>
        <span className="text-xs font-bold text-gray-500">Semifinal losers compete for bronze.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {thirdPlaceRows.map((matchup) => <BracketCard key={matchup.id} matchup={matchup} pairMode={pairMode} championship={championship} bronze />)}
      </div>
    </section>}
  </div>
  </>;
}

function orderRowsForDownstream(source: BracketMatchup[], target: BracketMatchup[], pattern: "STANDARD" | "CROSSED") {
  if (!target.length || source.length !== target.length * 2) return source;
  return sourceDisplayOrder(source.length, target.length, pattern).map((index) => source[index]!);
}

function BracketConnector({ source, target }: { source: BracketMatchup[]; target: BracketMatchup[] }) {
  const mapping = connectorMapping(source, target);
  return <div className="bracket-connector" aria-hidden="true">
    <svg className="bracket-connector-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      {target.map((_, targetIndex) => {
        const sources = mapping[targetIndex] ?? [];
        if (!sources.length) return null;
        const targetY = ((targetIndex + 0.5) / target.length) * 100;
        const sourceYs = sources.map((sourceIndex) => ((sourceIndex + 0.5) / source.length) * 100);
        const minY = Math.min(targetY, ...sourceYs);
        const maxY = Math.max(targetY, ...sourceYs);
        return <g key={targetIndex}>
          {sourceYs.map((sourceY, index) => <line key={index} x1="0" y1={sourceY} x2="48" y2={sourceY} />)}
          {sourceYs.length > 1 && <line x1="48" y1={minY} x2="48" y2={maxY} />}
          <line x1="48" y1={targetY} x2="100" y2={targetY} />
          {sourceYs.length === 1 && sourceYs[0] !== targetY && <line x1="48" y1={sourceYs[0]} x2="48" y2={targetY} />}
        </g>;
      })}
    </svg>
  </div>;
}

function connectorMapping(source: BracketMatchup[], target: BracketMatchup[]) {
  if (source.length === target.length * 2) return target.map((_, index) => [index * 2, index * 2 + 1]);
  if (source.length === target.length) return target.map((_, index) => [index]);
  return target.map(() => []);
}


function BracketCard({ matchup, pairMode, championship, bronze = false }: { matchup: BracketMatchup; pairMode: boolean; championship: boolean; bronze?: boolean }) {
  const isFinal = matchup.stage === "FINAL";
  const homeWon = Boolean(matchup.winnerTeamId && matchup.winnerTeamId === matchup.homeTeamId);
  const awayWon = Boolean(matchup.winnerTeamId && matchup.winnerTeamId === matchup.awayTeamId);
  return <article className={`bracket-match-card ${isFinal ? "bracket-match-card-final" : ""} ${bronze ? "bracket-match-card-bronze" : ""}`}>
    <Link href={`/matches/${matchup.id}`} className="bracket-card-meta hover:opacity-80">
      <span>{scheduleLabel(matchup)}</span>
      <strong>{displayStatus(matchup.status)}</strong>
    </Link>
    <TeamRow team={matchup.homeTeam} pairMode={pairMode} wins={matchup.homeWins} winner={homeWon} faded={Boolean(matchup.winnerTeamId) && !homeWon} champion={championship && isFinal && homeWon} />
    <TeamRow team={matchup.awayTeam} pairMode={pairMode} wins={matchup.awayWins} winner={awayWon} faded={Boolean(matchup.winnerTeamId) && !awayWon} champion={championship && isFinal && awayWon} />
    <div className="bracket-card-footer">
      <span>{matchup.stage === "THIRD_PLACE" ? "Battle for 3rd" : matchup.roundLabel}</span>
      <Link href={`/matches/${matchup.id}`} className="hover:underline">Best of {matchup.gamesPerMatchup} · first to {winsNeededForMatchup(matchup.stage, matchup.gamesPerMatchup)}</Link>
    </div>
  </article>;
}

function TeamRow({ team, pairMode, wins, winner = false, faded = false, champion = false }: { team: BracketMatchup["homeTeam"]; pairMode: boolean; wins: number; winner?: boolean; faded?: boolean; champion?: boolean }) {
  const pair = pairMode ? team?.pairs?.[0] : null;
  const name = pair ? `${formatPlayerCompactName(pair.playerA)} / ${formatPlayerCompactName(pair.playerB)}` : team?.name || "TBD";
  const identity = <><TeamMark team={team} winner={winner} /><span className="bracket-team-copy"><span className="bracket-team-name" title={team?.name || "TBD"}>{name}</span>{champion && <span className="bracket-champion-crown" title="Tournament champion"><Crown className="h-4 w-4" fill="currentColor"/><span>Champion</span></span>}</span></>;
  return <div className={`bracket-team-row ${faded ? "bracket-team-row-faded" : ""} ${champion ? "bracket-team-row-champion" : ""}`}>
    {team ? <Link href={`/teams/${team.id}`} className="bracket-team-line hover:ring-2 hover:ring-court/20">{identity}</Link> : <div className="bracket-team-line">{identity}</div>}
    <span className="bracket-score">{wins}</span>
  </div>;
}

function TeamMark({ team, winner }: { team: BracketMatchup["homeTeam"]; winner: boolean }) {
  if (team) return <TeamLogo team={team} variant="micro"/>;
  return <span className={`bracket-team-mark ${winner ? "bracket-team-mark-winner" : ""}`}>TB</span>;
}

function scheduleLabel(matchup: { queuePosition: number | null; courtLabel: string | null; stage: MatchupStage }) {
  if (matchup.queuePosition !== null) {
    return `Next #${matchup.queuePosition}${matchup.courtLabel ? ` · Court ${matchup.courtLabel}` : ""}`;
  }
  if (matchup.courtLabel) return `Court ${matchup.courtLabel}`;
  return matchup.stage.replaceAll("_", " ");
}
