# MPW Pickleball — Project State

Last architecture update: 2026-08-11

Latest performance/reliability update: 2026-08-11

Latest UI/UX update: 2026-08-12

## Current direction

The project has moved from a single fixed Open tournament implementation to a **flexible multi-division tournament engine**.

Primary operational requirement: organizers may change attendance, pairs, teams, groups, match counts, schedules, and future bracket structure on very short notice. The admin UI must absorb those changes without requiring code edits or database surgery.

## Implemented in this refactor

### Data model

- Added `Division`.
- Added division formats and additional matchup stages.
- Added tournament-level player pool status (`POOL`, `CONFIRMED`, `UNAVAILABLE`, `WITHDRAWN`).
- Added `DivisionPlayer` for division eligibility/confirmation.
- Made `Player.teamId` optional.
- Made `Team.groupId` optional.
- Added `Matchup.divisionId` and configurable `Matchup.gamesPerMatchup`.
- Added a data-preserving production migration from the original Open structure.
- Existing production tournament gets Open Division plus empty Executive Men/Women divisions.

### Admin

- Added **Tournament Setup** for division/group/team/matchup configuration.
- Reworked **Tournament Setup** into a selected-division operations console with division switching, summary metrics, readiness warnings, contextual group/team/matchup sections, and advanced disclosure for technical fields.
- Added editable future matchup stage, participants, game count, group/scope label, court, round, and Manila-local schedule.
- Added group/division round-robin generation with recorded-play guards.
- Added safe group rename/removal: renames keep historical group-label linkage aligned; removing a group is allowed only before recorded play, ungroups its teams, and deletes only its unplayed group matchups.
- Added safe removal of an unplayed team/pair unit: players return to the unassigned pool, obsolete future matchup slots are cleared, and any team with recorded play is protected from deletion.
- Converted Teams/Players admin into attendance-first **Player Pool** management.
- Player Pool now has event-day filters, scannable status badges, collapsed add-player workflow, and Quick Pair Unit remains available for confirmed unassigned players.
- Added division eligibility/confirmation controls.
- Added optional team assignment and pair activation/deactivation rules.
- Added **Quick Pair Unit** for two confirmed unassigned players (useful for Executive brackets).
- Changing a confirmed player to unavailable/withdrawn invalidates only affected future lineup usage; past recorded results remain intact.
- Moving an unplayed team to another division/group clears its stale future matchup slots and syncs member eligibility into the new division.

### Tournament engine

- Matchup completion uses each matchup's configured game count.
- Even game counts may legitimately produce a tied team matchup; code no longer invents an away-team winner on ties.
- Generic group standings/qualifier selection uses configured qualifiers-per-group and wildcard count.
- Group-knockout auto progression supports 2, 4, and 8 qualifiers.
- Unsupported qualifier counts remain manual/organizer-controlled.
- Future automatic knockout assignments can be recalculated without overwriting started matches.

### Public UI

- `/format` is generated from live configuration.
- `/groups` is dynamic; header no longer assumes `/groups/a`.
- Home, group, bracket, games, team, player, and matchup pages no longer advertise the original fixed counts as universal rules.
- Games are grouped with division identity to prevent cross-division collisions.

### Preserved systems

- Fan Favorite
- Male/Female MVP
- Live scoring/corrections/forfeits
- Audit logs
- Team leader lineups
- Simulation Center, including generic division/stage simulation
- Checkpoints/restore/undo/reset
- Player avatars

### Recovery changes

- Granular round/stage undo is now division-aware.
- Reset/rebuild no longer silently replaces the organizer's current structure with the original sample group format.
- Checkpoint activity snapshots are version 3 and understand division + game-count fields.
- Old v1/v2 snapshots fall back to the first configured division when restoring legacy matchups.
- Restore stops safely if a checkpoint references a team that has since moved to a different division, instead of recreating a cross-division mismatch.

## Important current boundaries

1. A player has one active `teamId` at a time. `DivisionPlayer` can represent eligibility in multiple divisions, but active team assignment selects the player's current competition unit.
2. Automatic group-knockout seeding is implemented for 2/4/8 qualifiers only. Use manual future matchups for other shapes.
3. Checkpoints snapshot **activity state** (matchups, lineups, games, scores, votes), not full structural master data. Division definitions, player-pool eligibility, and team master edits are not rolled back by checkpoint restore.
4. The factory seed intentionally recreates the original Open sample plus Executive divisions. Its 3-group/7-game values are examples, not engine constants.
5. Some deterministic simulation quick scenarios intentionally target the legacy Open sample shape (for example three-way/wildcard test scenarios). They are now scoped to the first configured grouped division so running those presets does not erase activity in Executive/other divisions. Generic simulation is division/stage-aware; production tournament logic must not depend on the legacy presets.
6. Public visibility is division-aware. `POOL`/tentative names remain admin-only, and private divisions are excluded from public player/game/match/team/MVP views.
7. Public game and player directories now use server-side pagination/search where useful. Live polling pauses in hidden tabs and refreshes on focus to reduce event-day database pressure.
8. Public route skeletons and neutral error/not-found pages are available for graceful slow-load and failure states.
9. Admin navigation is grouped into Operate, Engagement, Testing, and Recovery/System. Reset Data is intentionally visually separated from normal operations.

## Deployment checklist for this refactor

1. Back up PostgreSQL.
2. Run `npm ci`.
3. Run `npx prisma migrate deploy`.
4. Run `npx prisma generate`.
5. Run `npm run typecheck` and tests.
6. Run `npm run build`.
7. Open `/admin/tournament` and confirm Open + Executive divisions.
8. Open `/admin/players` and confirm existing Open players/pairs remain intact.
9. Verify `/format`, `/groups`, `/bracket`, `/fan-favorite`, and `/mvp`.
10. Create a test Executive candidate, confirm them, build a Quick Pair Unit, then create a future one-game matchup.
11. Confirm that marking a player unavailable reopens only future affected lineups and leaves completed scores unchanged.
12. Check `/api/health` after deployment and verify `/games` and `/players` pagination with real production-sized data.
13. Review `/admin/tournament` at desktop and mobile widths to confirm the selected-division console remains usable for last-minute changes.

## Admin usability/performance hardening — 2026-08-11

- Admin navigation is now a compact sticky operations bar with clear active states; primary tournament actions are visible first and destructive/testing tools stay visually separated.
- Added an admin route loading boundary so normal clicks give immediate feedback instead of appearing dead while a dynamic route is resolving.
- Player Pool was redesigned as a paginated, scan-first operations table instead of rendering hundreds of full edit forms and repeated team/division selects in one response.
- Player Pool now supports batch team assignment/unassignment, attendance changes, and division-status changes for selected players while preserving recorded-play protections.
- Individual identity/roster editing moved to `/admin/players/[id]`, including middle initial, nickname/display name, employment type, office/DEO, attendance, team assignment, division eligibility, and avatar.
- Tournament Setup now loads lightweight division summaries first and fetches full nested data only for the selected division. Added in-page jump controls for Settings, Groups, Teams/Pairs, and Schedule.
- Checkpoints listing no longer fetches large snapshot JSON blobs when only checkpoint metadata is displayed.
- Session lookup is request-memoized and selects only fields actually needed by the UI/permissions path.
- Admin dashboard queries select only fields used by the dashboard and now puts Tournament Setup and Player Pool ahead of testing/recovery shortcuts.

## Knockout / scorecard rules hardening — 2026-08-11

- Division settings now separate group/default games per matchup from knockout games per matchup. The Team Event can therefore use 7 games in group play and 5 games in QF/SF/Battle for 3rd/Grand Final without changing pair master data.
- Changing an unplayed knockout game count clears stale generated games/lineups so team leaders resubmit the correct number of pairs; started/completed history remains protected.
- Divisions can enable Battle for 3rd. Supported automatic brackets create it and populate it from the two semifinal losers.
- Divisions can toggle sudden death at 10-10. When enabled, an 11-10 completed score is valid; otherwise the normal win-by-two validation remains.
- Public bracket connectors now derive from actual feeder winners/assigned downstream teams rather than row-parity CSS, preventing misleading connector directions. Battle for 3rd is rendered separately beneath the championship progression.
- Official scorecards remain A4 landscape / two per sheet, but the physical card height and internal spacing were reduced substantially so each card is compact while preserving handwriting/signature areas.

- Current Team Event semifinal feed follows the supplied organizer schedule: QF1 winner vs QF3 winner, and QF2 winner vs QF4 winner. Public bracket display may reorder feeder cards visually after results resolve to avoid crossing/misdirected connectors without changing matchup identity.

## Live scoring and lineup operations hardening — 2026-08-11

- Admin point scoring now uses an in-place client console backed by JSON score actions. +1/-1 no longer performs a full page navigation. Normal rally updates write the Game + ScoreEvent only; expensive tournament dependency recalculation is deferred until a game/matchup decision can affect standings or bracket progression.
- The score console has direct Game 1..N navigation for the current team matchup so scorers do not need to bounce through the dashboard between pair games.
- Public matchup pages use compact in-place polling instead of refreshing the full matchup page every few seconds. Public live-score APIs now return only display-safe player fields rather than serializing complete Player rows.
- Finalizing, reopening, forfeiting, or correcting an individual pair game recalculates the parent team matchup immediately. Group standings surface decided pair-game wins/losses, game differential, and scoring point differential while a team matchup is still live. `Pts` means total points scored minus total points conceded across decided pair games; matchup P/W/L remain terminal-only.
- Provisional equal standings are no longer treated as actionable ties. `T#` labels and organizer tiebreak controls appear only after all matchups for that group table are terminal.
- Public result-heavy pages use a lightweight tournament-revision poll and refresh their server-rendered data only when a public matchup revision changes. Point-by-point rally scoring continues to use compact live-score polling and does not refresh full pages on every point.
- Team Event lineups are roster-based and matchup-specific. A manager selects two players for each required game; they are not restricted to a pre-created permanent pair list. Started/recorded game slots remain protected while future slots stay editable.
- Group-stage 7-of-7 pair lineups may auto-fill only when the eligible roster size exactly matches the required 14 players. Knockout 5-of-7 lineups intentionally do not guess which four players sit out.
- Pair rows created for Team Event lineup compatibility are treated as internal/historical snapshots. Tournament Setup no longer exposes those technical pair combinations as if they were permanent team configuration. Executive fixed-pair entrants remain available through an advanced Player Pool tool.
- Future player/pair invalidation now reopens only affected unplayed lineup slots. Scoring and scorecard printing verify that Game pair references still match the latest complete lineups, preventing stale pair sheets/results after a late roster change.
- Score finalization now rejects impossible overshoot finals (for example 12-9). Normal play ends at 11 with a two-point lead or, after 10-10, at the first two-point lead; sudden-death mode ends 10-10 on the next point.
- Testing/Simulation remains available for QA but is de-emphasized under Advanced admin tools and is not part of the normal team-leader or live-scoring workflow.
- Homepage live courts now use one batched `/api/public/live-games` poll per viewer instead of one request per live court, and the homepage no longer refreshes the entire RSC tree on a timer.
- Team/participation/eligibility edits now perform future-lineup invalidation and the corresponding master-data mutation in the same database transaction, preventing a failed edit from leaving valid future lineup slots removed.
## Tournament-day status and lineup UX pass — 2026-08-12

- Added one shared status vocabulary across manager, admin scoring, public matchup, game, and upcoming-matchup views: Ongoing, Ready to play, Pending lineup, Scheduled, Completed, Forfeited, and Interrupted. Statuses use text plus visual treatment rather than color alone.
- Team Leader portal now surfaces top-level action counts and prioritizes lineup work, ongoing matchups, ready matchups, and completed history. Matchup cards distinguish “Needs your lineup,” “Waiting for opponent,” and “Ready to play.”
- Match lineup editing now includes a roster-at-a-glance board. Every player is visibly marked as selected for a specific game, played/protected, unpaired, or unavailable; each game row separately indicates Pair ready / Pair needed / Protected. Unsaved and incomplete lineup states are explicit near the save action.
- Admin control room top metrics are tournament-operation-first (ongoing, live pair games, pending lineups, ready, scheduled, completed). The scoring table is urgency-sorted and individual game chips expose live/done/pending/interrupted state without opening the game.
- Group standings now show live scoring point differential. `Games`, `Diff`, and `Pts` update when each pair game is decided; `Pts` is the cumulative scoring margin (points for minus points against), not a +3 standings award. Played/Won/Lost remain terminal-only. Ranking uses completed team-matchup record first, then configured tiebreak metrics including game results and scoring point differential.
- Live/provisional standings metrics do not unlock tie/tiebreak actions: actionable ties still require every matchup in that group table to be terminal.


- Homepage bracket/navigation pass (2026-08-12): the public home page embeds the same live knockout bracket component used by `/bracket`; the hero makes View Bracket the orange primary CTA, Format Guide is secondary, and public navigation has an explicit Home item plus active-page highlighting.
- Admin Operate ordering (2026-08-12): team matchups with status `LIVE` are always sorted above Ready, Pending Lineup, and Scheduled rows, including the between-games state when no pair game is actively scoring.
