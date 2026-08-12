# Tournament Operations

## Terminology

- **Game:** one pair versus another pair.
- **Team Matchup:** one team/pair-unit versus another. The required number of pair games comes from `Matchup.gamesPerMatchup`.
- **Round:** a scheduled collection of team matchups.
- **Stage:** configurable scope such as Group, Round Robin, Quarterfinal, Semifinal, Final, Third Place, or Custom.

## Admin control room

The admin dashboard surfaces live games, ready team matchups, voting state, and links to scoring, voting, simulation, checkpoints, audit logs, avatars, and reset controls.

Each score update includes the current game version. A stale browser submission is rejected instead of overwriting a newer score. Finalization requires at least 11 points and a two-point winning margin; forfeits use a separate terminal state. Corrections and forfeits create score events and audit entries, then recalculate dependent records.

## Team-leader lineup workflow

1. Sign in with the assigned team-leader account.
2. Open a team matchup involving that account's team.
3. Submit exactly the number of playing pairs required by that matchup from the current confirmed roster. A one-game Executive matchup needs one pair; a seven-game Open matchup needs seven.
4. Submit the lineup.
5. Games are created only when both teams have valid lineups.

The server verifies ownership, division eligibility, confirmed attendance, the exact required pair count, unique pair IDs, and no duplicated players in the submitted lineup.

## Fan Favorite workflow

1. Admin opens **Fan Favorite Voting**.
2. Generate a batch of up to 100 codes and print the card sheet immediately.
3. Mark codes as issued when distributing them, or generate them already issued.
4. An attendee selects one eligible player and enters or scans one code.
5. The transaction checks tournament state, player eligibility, code hash, and code status.
6. The code is atomically moved to `USED` and one vote is created.
7. Reused, revoked, replaced, invalid, or raced submissions are rejected and recorded.

Plain codes are not stored in the database. They are displayed once after generation. Replacement codes are displayed once as well.

The public rankings refresh every three seconds and show rank, player, team, votes, percentage, total votes, voting status, deadline, and last-updated time.

## Simulation Center

Simulation Mode must be enabled. In production, destructive tools also require tournament-level permission.

Supported controls:

- quick states: fresh, lineups pending, mid/almost-complete group stage, three-way tie, wildcard tiebreak, semifinals ready, final ready, completed tournament, player/team forfeits, interruption, score correction, close/tied Fan Favorite races, and invalid/reused/revoked code attempts;
- one game with forced/random winner and dominant/close/deuce/random score;
- one configured team matchup using its current game count, with sweep/closest-win/forced/random outcomes;
- remaining group stage, semifinals, final, or entire tournament;
- deterministic seed, such as `20260729`;
- voting bursts toward random players or a selected player;
- undo of a completed simulation via its automatic pre-run checkpoint.

Simulation writes to the same lineups, games, score events, voting codes, votes, standings, bracket, and audit tables used by real operations.

## Checkpoints and undo

Manual checkpoints capture tournament settings, team matchups, lineups, games, score-event history, voting codes, Fan Favorite votes, and rejected/accepted vote-attempt history.

Available rollback scopes:

- latest score event;
- selected team matchup;
- selected round;
- selected stage;
- selected/latest completed simulation;
- full checkpoint restore.

A matchup/round/stage rollback preserves lineups, clears game results in the selected scope, and recalculates dependent tournament state. A safety checkpoint is created before the rollback.

## Reset Data Center

- **Scores only:** preserves lineups, master data, users, and voting data.
- **Tournament progress:** clears scores and future auto-progression while preserving the organizer's current divisions, groups, teams, and schedule records.
- **Event activity:** clears lineups, results, and voting activity while preserving the organizer's current structural configuration and matchup records.
- **Everything except users:** currently preserves existing master teams/players and accounts while rebuilding event activity.
- **Fan Favorite only:** clears votes and attempts, resets used/issued codes to unused, and preserves revoked/replaced codes.
- **Factory reset:** recreates local sample data and accounts; requires `ALLOW_FACTORY_RESET=true`. It cannot keep an in-database checkpoint because it deletes the owning tournament and accounts, so take a PostgreSQL backup first.

Each destructive reset requires an exact confirmation phrase. Scoped resets create an automatic checkpoint first. Production resets are denied unless `destructiveToolsEnabled` is enabled for the tournament.

## Official paper scorecards

When both sides have submitted complete lineups, the admin dashboard and Tournament Setup expose a **Scorecards** action for that matchup. The print preview produces two cards per A4 landscape page and is based on the latest generated games, so Team names and both players in every pair are pre-filled automatically. Group/bracket, round, and court can be adjusted on the print preview without mutating tournament records. Individual cards can be reprinted if a sheet is lost or a lineup changes before scoring.
