# Tournament Operations

## Terminology

- **Game:** one pair versus another pair.
- **Team Matchup:** one team versus another team, normally seven games.
- **Round:** a scheduled collection of team matchups.
- **Stage:** Group Stage, Semifinals, or Final.

## Admin control room

The admin dashboard surfaces live games, ready team matchups, voting state, and links to scoring, voting, simulation, checkpoints, audit logs, avatars, and reset controls.

Each score update includes the current game version. A stale browser submission is rejected instead of overwriting a newer score. Finalization requires at least 11 points and a two-point winning margin; forfeits use a separate terminal state. Corrections and forfeits create score events and audit entries, then recalculate dependent records.

## Team-leader lineup workflow

1. Sign in with the assigned team-leader account.
2. Open a team matchup involving that account's team.
3. Assign each of the team's seven active pairs exactly once.
4. Submit the lineup.
5. Games are created only when both teams have valid lineups.

The server verifies ownership, active pairs, seven unique pair IDs, and fourteen unique player IDs.

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
- one seven-game team matchup with sweep, 4–3, forced, or random result;
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
- **Tournament progress:** resets group results and removes knockout progression.
- **Event activity:** rebuilds the schedule and clears lineups, results, and voting activity.
- **Everything except users:** currently preserves existing master teams/players and accounts while rebuilding event activity.
- **Fan Favorite only:** clears votes and attempts, resets used/issued codes to unused, and preserves revoked/replaced codes.
- **Factory reset:** recreates local sample data and accounts; requires `ALLOW_FACTORY_RESET=true`. It cannot keep an in-database checkpoint because it deletes the owning tournament and accounts, so take a PostgreSQL backup first.

Each destructive reset requires an exact confirmation phrase. Scoped resets create an automatic checkpoint first. Production resets are denied unless `destructiveToolsEnabled` is enabled for the tournament.
