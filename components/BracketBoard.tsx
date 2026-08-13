import Link from "next/link";
import type { MatchupStage, Prisma } from "@prisma/client";
import { displayStatus } from "@/components/StatusBadge";
import { winsNeededForMatchup } from "@/lib/tournament/rules";

const PROGRESSION_STAGES = ["QUARTERFINAL", "SEMIFINAL", "FINAL"] as const;
export const KNOCKOUT_STAGES = [...PROGRESSION_STAGES, "THIRD_PLACE"] as const;
const STAGE_LABELS: Record<(typeof KNOCKOUT_STAGES)[number], string> = {
  QUARTERFINAL: "Quarterfinals",
  SEMIFINAL: "Semifinals",
  FINAL: "Grand Final",
  THIRD_PLACE: "Battle for 3rd",
};

export type BracketMatchup = Prisma.MatchupGetPayload<{
  include: { homeTeam: true; awayTeam: true; winnerTeam: true };
}>;

export default function BracketBoard({ matchups }: { matchups: BracketMatchup[] }) {
  const rawStageRows = PROGRESSION_STAGES
    .map((stage) => ({ stage, rows: matchups.filter((matchup) => matchup.stage === stage).sort((a, b) => a.order - b.order) }))
    .filter((entry) => entry.rows.length > 0);
  const stageRows = rawStageRows.map((entry, index) => ({
    ...entry,
    rows: orderRowsForDownstream(entry.rows, rawStageRows[index + 1]?.rows ?? []),
  }));
  const thirdPlaceRows = matchups.filter((matchup) => matchup.stage === "THIRD_PLACE").sort((a, b) => a.order - b.order);
  const finalWinners = matchups
    .filter((matchup) => matchup.stage === "FINAL" && matchup.winnerTeam)
    .map((matchup) => matchup.winnerTeam!)
    .filter((team, index, teams) => teams.findIndex((item) => item.id === team.id) === index);

  const gridTemplate = stageRows.flatMap((_, index) => index < stageRows.length - 1 ? ["minmax(260px, 1fr)", "72px"] : ["minmax(260px, 1fr)"]);
  if (finalWinners.length) gridTemplate.push("72px", "minmax(240px, .9fr)");

  return <>
    <div className="space-y-5 p-3 md:hidden">
      {stageRows.map((entry) => <section key={entry.stage}>
        <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-black uppercase">{STAGE_LABELS[entry.stage]}</h3><span className="text-[10px] font-bold uppercase text-gray-400">{entry.rows.length} matchup{entry.rows.length === 1 ? "" : "s"}</span></div>
        <div className="space-y-2">{entry.rows.map((matchup) => <BracketCard key={matchup.id} matchup={matchup} />)}</div>
      </section>)}
      {thirdPlaceRows.length > 0 && <section>
        <div className="mb-2"><div className="label text-amber-800">Semifinal consolation</div><h3 className="text-sm font-black uppercase">Battle for 3rd</h3></div>
        <div className="space-y-2">{thirdPlaceRows.map((matchup) => <BracketCard key={matchup.id} matchup={matchup} bronze />)}</div>
      </section>}
      {finalWinners.length > 0 && <section>
        <div className="mb-2 label text-court">Champion</div>
        {finalWinners.map((team) => <div key={team.id} className="bracket-winner-card"><div className="bracket-team-line"><TeamMark team={team} winner /><span className="bracket-team-name">{team.name}</span></div></div>)}
      </section>}
    </div>
    <div className="bracket-scroll hidden md:block">
    <div className="bracket-progression-grid" style={{ gridTemplateColumns: gridTemplate.join(" ") }}>
      {stageRows.map((entry, stageIndex) => {
        const next = stageRows[stageIndex + 1];
        return <div key={entry.stage} className="contents">
          <section className="bracket-column">
            <div className="bracket-stage-title">{STAGE_LABELS[entry.stage]}</div>
            <div className="bracket-stage-stack">
              {entry.rows.map((matchup, index) => <div key={matchup.id} className="bracket-positioned-card" style={{ top: `${((index + 0.5) / entry.rows.length) * 100}%` }}>
                <BracketCard matchup={matchup} />
              </div>)}
            </div>
          </section>
          {next && <BracketConnector source={entry.rows} target={next.rows} />}
        </div>;
      })}
      {finalWinners.length > 0 && <>
        <WinnerConnector />
        <section className="bracket-column bracket-winner-column">
          <div className="bracket-stage-title">Champion</div>
          <div className="bracket-winner-stack">
            {finalWinners.map((team) => <div key={team.id} className="bracket-winner-card">
              <div className="bracket-card-kicker">Champion</div>
              <div className="bracket-team-line">
                <TeamMark team={team} winner />
                <span className="bracket-team-name">{team.name}</span>
              </div>
            </div>)}
          </div>
        </section>
      </>}
    </div>

    {thirdPlaceRows.length > 0 && <section className="bracket-third-place-section">
      <div className="bracket-third-place-heading">
        <div><div className="label text-amber-800">Semifinal consolation</div><h3 className="text-lg font-black uppercase">Battle for 3rd</h3></div>
        <span className="text-xs font-bold text-gray-500">Semifinal losers compete for bronze.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {thirdPlaceRows.map((matchup) => <BracketCard key={matchup.id} matchup={matchup} bronze />)}
      </div>
    </section>}
  </div>
  </>;
}

function orderRowsForDownstream(source: BracketMatchup[], target: BracketMatchup[]) {
  if (!target.length || source.length !== target.length * 2) return source;
  const grouped = target.map(() => [] as BracketMatchup[]);
  for (const matchup of source) {
    if (!matchup.winnerTeamId) return source;
    const targetIndex = target.findIndex((next) => next.homeTeamId === matchup.winnerTeamId || next.awayTeamId === matchup.winnerTeamId);
    if (targetIndex < 0) return source;
    grouped[targetIndex]!.push(matchup);
  }
  if (grouped.some((rows) => rows.length !== 2)) return source;
  return grouped.flatMap((rows) => rows.sort((a, b) => a.order - b.order));
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
  const result: number[][] = target.map(() => []);
  let actualLinks = 0;
  source.forEach((matchup, sourceIndex) => {
    if (!matchup.winnerTeamId) return;
    const targetIndex = target.findIndex((next) => next.homeTeamId === matchup.winnerTeamId || next.awayTeamId === matchup.winnerTeamId);
    if (targetIndex >= 0) {
      result[targetIndex]!.push(sourceIndex);
      actualLinks += 1;
    }
  });

  if (actualLinks === source.length) return result;
  if (source.length === target.length * 2) {
    return target.map((_, targetIndex) => [targetIndex * 2, targetIndex * 2 + 1]);
  }
  if (source.length === target.length) return target.map((_, index) => [index]);
  return result;
}

function WinnerConnector() {
  return <div className="bracket-connector" aria-hidden="true">
    <svg className="bracket-connector-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="50" x2="100" y2="50" /></svg>
  </div>;
}

function BracketCard({ matchup, bronze = false }: { matchup: BracketMatchup; bronze?: boolean }) {
  const isFinal = matchup.stage === "FINAL";
  const homeWon = Boolean(matchup.winnerTeamId && matchup.winnerTeamId === matchup.homeTeamId);
  const awayWon = Boolean(matchup.winnerTeamId && matchup.winnerTeamId === matchup.awayTeamId);
  return <Link href={`/matches/${matchup.id}`} className={`bracket-match-card ${isFinal ? "bracket-match-card-final" : ""} ${bronze ? "bracket-match-card-bronze" : ""}`}>
    <div className="bracket-card-meta">
      <span>{scheduleLabel(matchup)}</span>
      <strong>{displayStatus(matchup.status)}</strong>
    </div>
    <TeamRow team={matchup.homeTeam} wins={matchup.homeWins} winner={homeWon} />
    <TeamRow team={matchup.awayTeam} wins={matchup.awayWins} winner={awayWon} />
    <div className="bracket-card-footer">
      <span>{matchup.stage === "THIRD_PLACE" ? "Battle for 3rd" : matchup.roundLabel}</span>
      <span>Best of {matchup.gamesPerMatchup} · first to {winsNeededForMatchup(matchup.stage, matchup.gamesPerMatchup)}</span>
    </div>
  </Link>;
}

function TeamRow({ team, wins, winner }: { team: BracketMatchup["homeTeam"]; wins: number; winner: boolean }) {
  return <div className={`bracket-team-row ${winner ? "bracket-team-row-winner" : ""}`}>
    <div className="bracket-team-line">
      <TeamMark team={team} winner={winner} />
      <span className="bracket-team-name">{team?.name || "TBD"}</span>
    </div>
    <span className="bracket-score">{wins}</span>
  </div>;
}

function TeamMark({ team, winner }: { team: BracketMatchup["homeTeam"]; winner: boolean }) {
  if (team?.logoUrl) return <img src={team.logoUrl} alt="" className="bracket-team-logo" />;
  const initials = team?.shortName?.slice(0, 2).toUpperCase() || "TB";
  return <span className={`bracket-team-mark ${winner ? "bracket-team-mark-winner" : ""}`}>{initials}</span>;
}

function scheduleLabel(matchup: { queuePosition: number | null; courtLabel: string | null; stage: MatchupStage }) {
  if (matchup.queuePosition !== null) {
    return `Next #${matchup.queuePosition}${matchup.courtLabel ? ` · Court ${matchup.courtLabel}` : ""}`;
  }
  if (matchup.courtLabel) return `Court ${matchup.courtLabel}`;
  return matchup.stage.replaceAll("_", " ");
}
