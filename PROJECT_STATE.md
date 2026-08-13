# MPW Pickleball — Project State

Last architecture update: 2026-08-13

Latest performance/reliability update: 2026-08-11

Latest UI/UX update: 2026-08-13

## Current direction

The project has moved from a single fixed Open tournament implementation to a **flexible multi-division tournament engine**.

Primary operational requirement: organizers may change attendance, pairs, teams, groups, match counts, court-queue order, and future bracket structure on very short notice. The admin UI must absorb those changes without requiring code edits or database surgery.

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
- Added editable future matchup stage, participants, match count, group/scope label, and round. Court assignment/order now belongs to the tournament-day queue rather than fixed clock scheduling.
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

- Matchup completion uses each matchup's configured pair-match count (`gamesPerMatchup` internally).
- Even pair-match counts may legitimately produce a tied team matchup; code no longer invents an away-team winner on ties.
- Generic group standings/qualifier selection uses configured qualifiers-per-group and wildcard count.
- Group-knockout auto progression supports 2, 4, and 8 qualifiers.
- Unsupported qualifier counts remain manual/organizer-controlled.
- Future automatic knockout assignments can be recalculated without overwriting started matches.

### Public UI

- `/format` is generated from live configuration.
- `/groups` is dynamic; header no longer assumes `/groups/a`.
- Home, group, bracket, Matches directory, team, player, and matchup pages no longer advertise the original fixed counts as universal rules.
- Pair matches are grouped with division identity to prevent cross-division collisions.

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
- Checkpoint activity snapshots are version 4 and also preserve the tournament-day active-court count plus matchup queue positions.
- Old v1/v2 snapshots fall back to the first configured division when restoring legacy matchups.
- Restore stops safely if a checkpoint references a team that has since moved to a different division, instead of recreating a cross-division mismatch.

## Important current boundaries

1. A player has one active `teamId` at a time. `DivisionPlayer` can represent eligibility in multiple divisions, but active team assignment selects the player's current competition unit.
2. Automatic group-knockout seeding is implemented for 2/4/8 qualifiers only. Use manual future matchups for other shapes.
3. Checkpoints snapshot **activity state** (matchups, lineups, pair-match records, scores, votes), not full structural master data. Division definitions, player-pool eligibility, and team master edits are not rolled back by checkpoint restore.
4. The factory seed intentionally recreates the original Open sample plus Executive divisions. Its 3-group/7-match values are examples, not engine constants.
5. Some deterministic simulation quick scenarios intentionally target the legacy Open sample shape (for example three-way/wildcard test scenarios). They are now scoped to the first configured grouped division so running those presets does not erase activity in Executive/other divisions. Generic simulation is division/stage-aware; production tournament logic must not depend on the legacy presets.
6. Public visibility is division-aware. `POOL`/tentative names remain admin-only, and private divisions are excluded from public player/pair-match/team-matchup/team/MVP views.
7. The public Matches and player directories now use server-side pagination/search where useful. Live polling pauses in hidden tabs and refreshes on focus to reduce event-day database pressure.
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
10. Create a test Executive candidate, confirm them, build a Quick Pair Unit, then create a future one-match matchup.
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

- Division settings now separate group/default pair matches per matchup from knockout pair matches per matchup. The Team Event can therefore use 7 matches in group play and 5 matches in QF/SF/Battle for 3rd/Grand Final without changing pair master data.
- Changing an unplayed knockout match count clears stale generated matches/lineups so team leaders resubmit the correct number of pairs; started/completed history remains protected.
- Divisions can enable Battle for 3rd. Supported automatic brackets create it and populate it from the two semifinal losers.
- Legacy `suddenDeathAtTen` remains only for CUSTOM-stage compatibility. Current GROUP/ROUND_ROBIN and playoff scoring is stage-driven; see the latest scoring section below.
- Public bracket connectors now derive from actual feeder winners/assigned downstream teams rather than row-parity CSS, preventing misleading connector directions. Battle for 3rd is rendered separately beneath the championship progression.
- Official scorecards use A4 landscape with two portrait scorecards side-by-side per sheet. Each card now uses the printable height, the separate Group input was removed because group identity comes from the configured round/matchup, and the umpire band is deliberately compact so player/score/signature space is maximized.

- Current Team Event semifinal feed follows the supplied organizer schedule: QF1 winner vs QF3 winner, and QF2 winner vs QF4 winner. Public bracket display may reorder feeder cards visually after results resolve to avoid crossing/misdirected connectors without changing matchup identity.

## Live scoring and lineup operations hardening — 2026-08-11

- Admin point scoring now uses an in-place client console backed by JSON score actions. +1/-1 no longer performs a full page navigation. Normal rally updates write the Game + ScoreEvent only; expensive tournament dependency recalculation is deferred until a pair-match/team-matchup decision can affect standings or bracket progression.
- The score console has direct Match 1..N navigation for the current team matchup so scorers do not need to bounce through the dashboard between pair matches.
- Public matchup pages use compact in-place polling instead of refreshing the full matchup page every few seconds. Public live-score APIs now return only display-safe player fields rather than serializing complete Player rows.
- Finalizing, reopening, forfeiting, or correcting an individual pair match recalculates the parent team matchup immediately. Group standings update Matches/W/L, NPD, and total points immediately from decided pair matches while a team matchup is still live.
- Provisional equal standings are no longer treated as actionable ties. `T#` labels and organizer tiebreak controls appear only after all matchups for that group table are terminal.
- Public result-heavy pages use a lightweight tournament-revision poll and refresh their server-rendered data only when a public matchup revision changes. Point-by-point rally scoring continues to use compact live-score polling and does not refresh full pages on every point.
- Team Event lineups are roster-based and matchup-specific. A manager selects two players for each required match; they are not restricted to a pre-created permanent pair list. Started/recorded match slots remain protected while future slots stay editable.
- Lineups have explicit Fill all editable slots / Empty all editable slots controls. Fill uses eligible unused players and respects the configured Men’s/Women’s/Mixed category for every editable slot; played slots remain protected.
- Pair rows created for Team Event lineup compatibility are treated as internal/historical snapshots. Tournament Setup no longer exposes those technical pair combinations as if they were permanent team configuration. Executive fixed-pair entrants remain available through an advanced Player Pool tool.
- Future player/pair invalidation now reopens only affected unplayed lineup slots. Scoring and scorecard printing verify that internal `Game` pair references still match the latest complete lineups, preventing stale pair sheets/results after a late roster change.
- Score finalization rejects impossible overshoot finals. Stage-specific scoring is authoritative: group/round-robin uses 11-point sudden death at 10-10, while playoffs use target 11 / win by 2 / cap 15.
- Testing/Simulation remains available for QA but is de-emphasized under Advanced admin tools and is not part of the normal team-leader or live-scoring workflow.
- Homepage live courts now use one batched `/api/public/live-games` poll per viewer instead of one request per live court, and the homepage no longer refreshes the entire RSC tree on a timer.
- Team/participation/eligibility edits now perform future-lineup invalidation and the corresponding master-data mutation in the same database transaction, preventing a failed edit from leaving valid future lineup slots removed.
## Tournament-day status and lineup UX pass — 2026-08-12

- Added one shared status vocabulary across manager, admin scoring, public matchup, match, and upcoming-matchup views: Ongoing, Ready to play, Pending lineup, Scheduled, Completed, Forfeited, and Interrupted. Statuses use text plus visual treatment rather than color alone.
- Team Leader portal now surfaces top-level action counts and prioritizes lineup work, ongoing matchups, ready matchups, and completed history. Matchup cards distinguish “Needs your lineup,” “Waiting for opponent,” and “Ready to play.”
- Match lineup editing now includes a roster-at-a-glance board. Every player is visibly marked as selected for a specific match, played/protected, unpaired, or unavailable; each match row separately indicates Pair ready / Pair needed / Protected. Unsaved and incomplete lineup states are explicit near the save action.
- Admin control room top metrics are tournament-operation-first (ongoing, live pair matches, pending lineups, ready, scheduled, completed). The scoring table is urgency-sorted and individual match chips expose live/done/pending/interrupted state without opening the match.
- Group standings now use `Matches`, `W`, `L`, `NPD`, and `TP`. Matches/W/L are decided pair-match totals, `NPD` is total points scored minus total points conceded across decided pair matches, and `TP` is accumulated points scored. Ranking uses Total Pair Match Wins → NPD → head-to-head → Total Points Scored.
- Live/provisional standings metrics do not unlock tie/tiebreak actions: actionable ties still require every matchup in that group table to be terminal.


- Homepage bracket/navigation pass (2026-08-12): the public home page embeds the same live knockout bracket component used by `/bracket`; the hero makes View Bracket the orange primary CTA, Format Guide is secondary, and public navigation has an explicit Home item plus active-page highlighting.
- Admin Operate ordering (2026-08-12): team matchups with status `LIVE` are always sorted above Ready, Pending Lineup, and Scheduled rows, including the between-matches state when no pair match is actively scoring.

## Match terminology, official tiebreaks, scorecard + mobile pass — 2026-08-12

- Standardized user-facing tournament language on **Match / Matches**. Internal Prisma `Game` records, API identifiers, and the existing `/games` route remain unchanged intentionally to avoid an unnecessary schema/URL migration.
- Group ranking uses the organizer-approved order directly: **A. Total Pair Match Wins, B. Net Point Differential, C. Head-to-head among teams still tied after A/B, D. Total Points Scored**. Exact ties still require organizer resolution only after the group stage is terminal.
- Public group standings display **Matches / W / L / NPD / TP**, all based on decided pair matches.
- Official paper scorecards now print as **two portrait cards side-by-side on one A4 landscape sheet**. The standalone Group field was removed; labels derive group context from the configured round/matchup (for example, `Group A Match 3`). The umpire signature band is fixed/compact and the rest of the printable height is used for match details, handwritten scores, and signatures.
- Mobile navigation is now action-first: the public header keeps a compact sticky identity row plus a horizontally scrollable active-page nav strip. Admin navigation accounts for the taller mobile header.
- Authentication is persistent and predictable: Sign in / Sign out always occupies the top-right header slot. Signed-in users also get a two-item mobile bottom navigation for Home and their role-appropriate Dashboard; duplicate page-level logout buttons were removed.
- Wide operational tables were replaced or supplemented with purpose-focused mobile cards on Control, Player Pool, Audit, Checkpoints, and Voting. Tournament Setup uses the same responsive court queue on mobile and desktop instead of a fixed-time bulk schedule grid.
- Live match/scoring views keep both sides visible in compact three-column layouts on phones; the scorer's +1/−1 controls remain side-by-side. Public match lists and live-court cards use compact pair/score/pair layouts rather than desktop rows squeezed onto small screens.
- Player recognition is photo-first on identity-heavy screens. MVP and Fan Favorite use materially larger portraits, team rosters give avatars stronger emphasis, and public/live match views show both players' headshots instead of hiding avatars on mobile. Initials remain the fallback when no image is available.
- The public bracket has a dedicated vertical mobile progression view instead of forcing the wide desktop connector canvas into horizontal scrolling. Secondary explanatory copy, legends, and low-frequency filters are collapsed/hidden on small screens where they do not help the immediate task.
- The homepage now renders `finalbanner.png` at its natural aspect ratio on phones instead of forcing a tall crop, so the full event artwork remains visible while consuming less vertical space. Desktop keeps the lightweight hero CTAs over the lower-right of the banner; mobile keeps the same visual language in a compact 2×2 action grid below it.
- Low-frequency QA/reference content is reduced on phones as well: Simulation history uses mobile cards, MVP formula details collapse, and dashboard quick-action descriptions are desktop-only while the actions themselves remain immediately available.



## Court queue + lineup category rules — 2026-08-13

- Fixed clock scheduling is retired for future/unplayed matchups. Admin sets `Tournament.activeCourtCount`, then queues whole team matchups as sequential blocks with a court assignment. A Team A vs Team B 7-match matchup is one queue row covering Matches 1–7, not seven separate schedule entries.
- `Matchup.queuePosition` is the canonical upcoming order. Public Upcoming Matchups sorts by this field; group match lists, match directory ordering, leader/admin operational lists, and bracket metadata also prefer queue order where relevant. Completing a team matchup removes it from the active queue while preserving its court label for history.
- Existing `scheduledAt` remains in Prisma/checkpoints only for backward compatibility; no new admin UI writes a clock time. The migration clears old time/court metadata from future matchups that have no recorded play.
- Team identity is directly editable from Tournament Setup without changing group placement or player assignments.
- Divisions can independently enforce per-slot lineup categories for group/round-robin and playoff stages: `MENS`, `WOMENS`, or `MIXED`. Current 7-match group defaults are Men’s, Women’s, Men’s, Women’s, Men’s, Women’s, Mixed; current 5-match playoff defaults are Men’s, Women’s, Mixed, Women’s, Men’s.
- Team-manager dropdowns visually distinguish available vs disallowed players, mark duplicates in red, and prevent invalid selections. The lineup API repeats eligibility, duplicate-player, and category validation server-side so UI bypasses cannot save an invalid lineup.
- Started/recorded match slots remain immutable. If category rules change later, historical locked slots are not retroactively invalidated; enforcement applies to editable/future slots.
- The signed-in header Dashboard shortcut remains desktop-only; mobile keeps role navigation outside the header.


## Tournament Setup workflow + live court board — 2026-08-13

- Tournament Setup was simplified into one visible operational sequence: **Division → Teams & Groups → Lineup Rules → Courts → Matchups**. The duplicate Team Placement section and the always-visible bulk/dev-helper panel were removed from the normal workflow.
- Team identity and group placement now live together on each team card; lineup category rules have their own focused section instead of being buried inside the full division form.
- Testing/simulation and destructive developer tools remain implemented but no longer occupy the primary Admin navigation.
- Tournament-day scheduling now renders as per-court lanes with matchup blocks, while `Matchup.queuePosition` remains the canonical overall call order.
- Active court count, queue insertion, court reassignment, queue reorder, and queue removal use client-side fetch mutations with authoritative server state returned as JSON. These actions no longer navigate/reload the Tournament Setup page.
- Header auth controls now occupy the far-right desktop slot. The header Dashboard shortcut is wrapped in a desktop-only container so the shared `.btn-ghost` display rule cannot accidentally make it visible on mobile; signed-in mobile users use the bottom Dashboard navigation instead.


## Playoff clinch, stage scoring + public UX pass — 2026-08-13

- Knockout team matchups are majority series. A 5-match playoff is best-of-5 / first to 3; once a side reaches three match wins, the matchup is complete immediately and untouched remaining slots are shown as **Not needed** rather than blocking advancement. Group/round-robin team matchups still play every configured pair match because pair-match wins, NPD, and TP all matter to standings.
- Stage scoring is now authoritative in shared tournament rules and score validation: **Group/round-robin = first to 11, sudden death at 10-10, hard max 11**; **QF/SF/Final/Battle for 3rd = target 11, win by 2 after 10-10, hard cap 15**, with 15-14 valid at the cap.
- Simulation uses the same stage score rules, lineup-category restrictions, no-duplicate-player rule, and knockout early-clinch behavior. Sweep simulations of a 5-match playoff record only three matches; close series may use all five.
- Public live-match/scoring surfaces use compact player names where full legal names are unnecessary (for example, `A. Eala`). Full names remain on identity-heavy pages such as Players, MVP, and Fan Favorite.
- Signed-in mobile users again have the sticky **Home / Dashboard** bottom navigation. The top-header Dashboard remains desktop-only, while Sign in / Sign out stays at the far-right header slot.
- Tournament Setup is now a true five-tab workspace instead of anchor scrolling. The chosen tab is remembered for the browser session so ordinary form saves return the organizer to the same setup area.
- Upcoming-matchup and match-directory context labels suppress duplicated group/round wording.
- Public pages share a quieter typography/spacing/card treatment. The public Players page was rebuilt with search plus Division, Team, Category filters and First name / Last name / Team sorting.
