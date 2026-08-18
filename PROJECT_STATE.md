# 2026-08-18 Fan Favorite fairness / MVP UI / visitor analytics patch

- Fan Favorite now enforces a **30-second cooldown per anonymous browser only after a successfully accepted vote**. Invalid, reused, unreleased, revoked, or otherwise rejected codes do not start the cooldown. Broad IP/global/code flood guards remain separate.
- Fan Favorite candidate order is shuffled server-side on each real page request/refresh. This changes display order only; player IDs, teams, vote counts, rankings, and stored data are untouched.
- Removed the QR-scanning/rendering workflow. Voting remains code-based through typed/copied public or manual codes.
- Added a public **Support by Team / District** breakdown. It groups valid votes by the team of the player who received the vote; it does not infer or collect the voter's team/location.
- MVP scoring math, eligibility, and locked-pair rules are unchanged. The MVP UI now uses compact ranking rows, a single shared locked-pair tie presentation, and expandable factor/formula details instead of repetitive criterion cards.
- Added lightweight first-party **Superadmin visitor analytics**: page views, approximate unique visitors, hourly traffic, top public pages, coarse device mix, and external referrer host. No raw IP, names, query strings, or full referrer URLs are stored.
- Visitor analytics and successful-vote cooldown share the same anonymous browser identifier. The additive migration introduces `VoteAttempt.visitorKey` and the `PageView` table.

---

# 2026-08-18 Multi-event / roles / MVP patch

- Preserved the existing Team Event workflow while making public and admin surfaces division/event-aware. Public Matches, Groups, Bracket, Players, Teams, and MVP surfaces can switch between **Team Event**, **Men’s Executive**, and **Women’s Executive** through event tabs.
- Executive divisions use `entrantType=PAIR` plus an explicit `sexCategory` (`MALE` / `FEMALE`) instead of inferring Men’s/Women’s behavior from names or slugs. The fixed pair is the public entrant; the existing Team/Pair/Game storage remains an internal compatibility layer so the proven scoring, standings, scheduling, and bracket engines do not need a parallel implementation. Pair matchups are always one scoreable match and their fixed lineups/games are prepared automatically, including after automatic knockout progression.
- Authentication now has three roles: `SUPERADMIN`, `ADMIN`, and `TEAM_MANAGER`. The migration maps legacy `ADMIN` accounts to `SUPERADMIN` and legacy `TEAM_LEADER` accounts to `TEAM_MANAGER` to preserve existing access safely.
- `SUPERADMIN` owns setup/configuration, player/pair master data, accounts, voting setup, simulation, checkpoints/reset, audit/system controls, plus all live operations. `ADMIN` is a game-day operator for live scoring and score-event recovery only. `TEAM_MANAGER` retains only its own Team Event lineup-submission workflow. Permissions are enforced server-side.
- Added Superadmin account management for operational Admin and Team Manager accounts.
- Reworked MVP into a transparent 0-100 **MVP Index** with visible components and weights: wins 15%, win rate 20%, participation/trust 10%, playoff impact 20%, strength of schedule 15%, point differential 15%, team finish 5%. Normalization for wins/participation/playoff impact is sex-category-specific.
- Formal MVP eligibility requires **3 completed matches**, while provisional candidates remain visible before that threshold.
- An exact top tie caused by the same locked pair can be resolved only by Superadmin organizer selection; the public winner is labeled **Selected by organizers**. A clear leader requires no organizer intervention.
- MVP selection is stored in `MvpSelection` per division and sex category, and is only honored when the current calculated leaders still form a valid locked-pair tie.

---

# MPW Pickleball — Project State

Last architecture update: 2026-08-18

Latest performance/reliability update: 2026-08-13

Latest UI/UX update: 2026-08-18

## Current direction

The project has moved from a single fixed Open tournament implementation to a **flexible multi-division tournament engine**.

Primary operational requirement: organizers may change attendance, pairs, teams, groups, match counts, court-queue order, and future bracket structure on very short notice. The admin UI must absorb those changes without requiring code edits or database surgery.

## Implemented in this refactor

### Data model

- Added `Division` (including optional event `sexCategory`).
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
- Added fixed Executive pair creation for two confirmed, event-eligible players. Executive membership is independent of the player’s Team Event roster assignment.
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
- Team Manager lineups
- Simulation Center, including generic division/stage simulation
- Checkpoints/restore/undo/reset
- Player avatars

### Recovery changes

- Granular round/stage undo is now division-aware.
- Reset/rebuild no longer silently replaces the organizer's current structure with the original sample group format.
- Checkpoint activity snapshots are version 6 and preserve tournament-day activity state including active-court count, matchup queue positions, champion media metadata, voting code batches, and public-code metadata; older supported snapshots remain restorable.
- Old v1/v2 snapshots fall back to the first configured division when restoring legacy matchups.
- Restore stops safely if a checkpoint references a team that has since moved to a different division, instead of recreating a cross-division mismatch.

## Important current boundaries

1. `Player.teamId` is the active Team Event roster assignment. Executive fixed-pair participation is separate through `DivisionPlayer` + the pair entrant wrapper, so a player can remain on a Team Event roster while also joining an Executive event.
2. Automatic group-knockout seeding is implemented for 2/4/8 qualifiers only. Use manual future matchups for other shapes.
3. Checkpoints snapshot **activity state** (matchups, lineups, pair-match records, scores, votes), not full structural master data. Division definitions, player-pool eligibility, and team master edits are not rolled back by checkpoint restore.
4. The factory seed recreates the Team Event sample plus Men’s Executive and Women’s Executive. Its 3-group/7-match Team Event values are examples, not engine constants.
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
7. Open `/admin/tournament` and confirm Team Event + Men’s Executive + Women’s Executive divisions.
8. Open `/admin/players` and confirm existing Team Event players/pairs remain intact and Executive pair candidates are sex-filtered.
9. Verify `/format`, `/groups`, `/bracket`, `/fan-favorite`, and `/mvp`.
10. Create a test Executive fixed pair, then create a future one-match matchup and confirm its scoreable game is prepared automatically.
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
- Official scorecards use A4 portrait with two landscape half-sheet scorecards stacked top-and-bottom for a crosswise cut. The separate Group input remains removed because group identity comes from the configured round/matchup, and signature bands are compact so the half-sheet remains writable.

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
- Official paper scorecards now print as **two landscape half-sheet cards stacked on one A4 portrait sheet**, separated by a crosswise cut guide. The standalone Group field is removed; labels derive group context from the configured round/matchup (for example, `Group A Match 3`).
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

### 2026-08-13 public discovery + Fan Favorite pass

- Public `/games` now treats District / Team, Player, and exact Team-vs-Team Matchup as the primary discovery filters. Status remains available as a secondary filter and preserves the selected primary filters. No new District schema was introduced; existing Team identity is the canonical district/team filter for labels such as CCDEO vs BDEO.
- Public player cards link to `/players/[id]`. The player profile shows decided-match record, NPD, total points, partner/opponents, scores, tournament context, and linked match history while preserving public-division/confirmed-player visibility rules.
- Fan Favorite now has a deliberately playful crowd-choice visual treatment distinct from MVP. The homepage surfaces the leading male and female separately, and the full voting page emphasizes the crowd race while preserving the existing one-code/two-vote rules and live ranking API.

## Smart public discovery + live poster treatment — 2026-08-13

- Public Matches and Players filters now auto-apply. Select controls navigate immediately and text search uses a short debounce; Apply buttons are no longer required.
- Public filter choices are context-aware. On Matches, selecting a district/team restricts the Player list to that team and the Matchup list to matchups involving that team; selecting a player also narrows matchup choices to that player's team. Incompatible stale selections are ignored safely. On Players, Division continues to constrain the available Team choices.
- MVP surfaces now present the current male/female leaders as a live **Mythical Pair** poster whenever completed-match data exists. The treatment is explicitly marked live/not final so it does not imply the official award has already been decided.
- Fan Favorite's “Who owns the crowd today?” hero now displays the current male and female crowd leaders as poster-style cards with live vote totals/shares.
- The public bracket no longer generates a separate Champion column. The winner of the Grand Final is crowned directly inside the Grand Final matchup card.

## Champion-state homepage + recency/avatar pass — 2026-08-13

- Grand Final winners remain inside the Grand Final bracket card; the champion team name is always visible and the crown/Champion badge is rendered as secondary metadata instead of consuming the team-name line.
- Public result/history surfaces use newest activity first and oldest last. This does **not** reverse structural/operational ordering: Matches inside one team matchup remain Match 1 → N, Upcoming Matchups remain court-queue order, and bracket stages retain progression order.
- Public live-match feeds use most recently started matches first.
- Player selectors that benefit from visual identity use avatar-aware pickers instead of relying on native `<select>` options, which cannot render headshots consistently. Public Matches player filtering, Team Manager lineup selection, and the advanced Executive pair entrant flow use the shared picker.
- Homepage information hierarchy is now Standings before Tournament Bracket during group-stage browsing.
- Once a public division's Grand Final is officially decided, the homepage live-courts slot becomes a championship celebration poster for that division. The poster is data-driven from the actual champion team roster and also surfaces the current/final Mythical Pair and Fan Favorite leaders. Multiple completed public divisions can render separate champion posters without hardcoding one tournament format.

## Simulation randomness + configurable QF bracket + champion media — 2026-08-13

- Simulation no longer defaults to a fixed seed. Leaving Seed blank generates a fresh server seed per run, while entering a seed intentionally reproduces a prior test. Generic completed-tournament simulations randomize semifinal/final outcomes instead of forcing the home side.
- Simulation dropdowns hide completed/forfeited individual matches and team matchups. Stage/division selectors are derived from unfinished competition so finished items do not remain normal simulation targets.
- Added persisted Quarterfinal qualification-source mapping for supported 8-qualifier automatic brackets. Each QF top/bottom slot can be assigned from configured Group rank or Wildcard rank sources in Tournament Setup; actual teams resolve from final standings. Semifinal, Final, and Battle-for-3rd winner/loser progression remains unchanged.
- QF source mapping is locked once QF play has recorded history. Manually changing a future QF competitor clears that automatic source mapping to preserve the organizer's explicit override.
- Tournament Setup now exposes the existing division-wide **Generate all group matchups** backend action, while retaining per-group generation.
- Added optional Division champion image metadata and an admin-only upload flow after a Grand Final winner exists. The homepage champion poster uses the image only when it belongs to the current winner; otherwise it shows a navy/gold photo placeholder. Champion image metadata participates in checkpoints/reset safety.
- Fixed the Grand Final champion-name visibility bug: the final card inherited white text into a white team row. Bracket team rows now set their own foreground color so the winning team name remains visible beside the crown.
- Quick knockout scenarios are stage-aware: Semifinals Ready completes any QFs first, Final Ready completes QF/SF feeders, and Tournament Completed walks through configured QF/SF/Battle-for-3rd/Final stages instead of assuming groups feed directly into semifinals.

## Public outcome cues + QF setup guardrails — 2026-08-13

- Completed Group Knockout standings now expose qualification state directly: officially advanced teams are green, eliminated teams are red, and unresolved tiebreak participants remain amber/pending. The state is derived from the configured `qualifiersPerGroup` / wildcard rules after the full division group stage is terminal; it is not hardcoded to a fixed top-two format.
- Tournament Setup Quarterfinal seed-source pickers are now mutually exclusive in the UI. Once a Group/Wildcard seed source is chosen for one QF box, it disappears from the remaining boxes while staying visible in its own selector. Server-side uniqueness validation remains authoritative.
- Public result language now uses stronger consistent semantics: green for winners/qualified/ready/completed-positive outcomes, red for losses/elimination, orange for live action, while blue remains the primary brand/navigation color.
- Shared score/status/bracket/standings components use these cues so viewers can identify the winner, eliminated side, qualification state, and live state at a glance. Public Group, Bracket, Matchup, Team, and Player-history surfaces received the same clearer hierarchy without changing tournament logic.

## Public performance + motion — 2026-08-13

- Public polling is staggered/jittered instead of synchronized. Fan Favorite uses a slower adaptive interval when voting is closed.
- Fan Favorite rankings, live-game JSON, current public tournament id, and the public matchup revision use short process-local read caches/request deduplication to absorb spectator bursts without changing result correctness.
- Fan Favorite voting keeps transactional one-time-code consumption but uses shared-network-safe layered rate limits so venue NAT traffic is not blocked by the previous low per-IP ceiling.
- Avatar/champion images stream from disk and are immutable-cached by UUID filename. Homepage hero prefers a compressed WebP source with PNG fallback.
- Public pages use restrained one-time scroll reveals and vote/progress transitions; `prefers-reduced-motion` disables motion.
- No tournament format/scoring/advancement logic changed in this pass.

## Pre-launch countdown + public entity navigation + Teams — updated 2026-08-18

- Public access is **not gated** by the tournament timer. Public pages/APIs remain browseable before the official start.
- The configured tournament start is now a homepage **Live Courts fallback countdown** only: an actual LIVE/INTERRUPTED match always overrides it; before start with no live match the countdown is shown; after start with no live match the normal empty-live state is shown.
- Prefer `TOURNAMENT_START_AT` for the timer. The legacy `TOURNAMENT_PUBLIC_LAUNCH_AT` env remains supported as a fallback so existing production configuration does not break.
- Public navigation now exposes a first-class **Teams** page and keeps literal primary labels (`Matches`, `Groups`, `Teams`, `Players`, `Bracket`), moving only secondary destinations (`Format`, `Fan Favorite`, `MVP`) under **More**.
- Public match/bracket/history surfaces no longer rely on one giant nested card link where that blocks entity navigation. Player names/avatars and team names link to their canonical public pages when the surrounding control is not a form/action.
- Official scorecard printing is A4 portrait with two landscape half-sheet cards stacked top-and-bottom and a crosswise cut guide.

## Draw board + team profile + poster/print polish — 2026-08-17

- Tournament Setup keeps one primary group-placement workflow: a Group Assignment Board inside **Teams & Groups**. Organizers can drag teams between groups on desktop or tap a team and choose a destination on touch devices, then save the full draw once.
- Bulk group reassignment is history-safe. Recorded play locks the draw; changing a draw with only unplayed group fixtures requires explicit confirmation and clears those future group fixtures/standing overrides for regeneration. No schema change was introduced.
- Public Team profiles stay deliberately lean: team/group identity, current group rank and pair-match W-L when available, confirmed roster, and that team's relevant matchup list.
- MVP Mythical Pair and Fan Favorite hero/poster surfaces carry MPW Dink & Dash branding plus subtle pickleball court/ball visual cues using existing lightweight assets.
- Mobile bracket progression renders Battle for 3rd before the Grand Final so the Grand Final is the last playoff card in the vertical flow; desktop progression remains unchanged.
- Print media hides mobile sticky navigation and removes its body bottom padding so official scorecard sheets contain scorecard content only.

## Court-sequenced manager lineups + public browse/mobile UX — 2026-08-17

- Team Manager lineup editing is sequential per team and follows the facilitator court queue. A live/interrupted matchup remains the current editable matchup; otherwise only the earliest unfinished queued matchup is open. Later and unqueued matchups stay locked until the current matchup is completed/forfeited or the facilitator queues the next one.
- The same lineup sequencing rule is enforced server-side by the Team Manager lineup API, so direct URLs or custom requests cannot bypass the lock. The court board explicitly notes that queue order controls Team Manager lineup access.
- The public Teams page is group-first rather than a flat directory. Team rows are fully clickable and prioritize team identity, confirmed roster preview, and current group rank/W-L when results exist; redundant View Team actions and detached KPI-style count cards were removed.
- Public Teams, Players, and Matches use compact inline counts/context instead of floating total-count boxes. Mobile public headers, filters, cards, and page spacing prioritize useful content/actions in the first viewport and reduce unnecessary scrolling without changing tournament logic.
- The desktop More menu is anchored directly to its trigger. Existing mobile More-menu behavior is preserved.

## Stage-weighted MVP + live Fan Favorite code drops — 2026-08-17

- Public player-centric surfaces now use lightweight sex indicators where they improve scanning: a plain blue `♂` for male players and plain pink `♀` for female players. The symbols have no badge/background and are intentionally limited to useful identity/selection contexts such as Players, Team rosters, lineups, MVP, and Fan Favorite.
- Public Matches are ordered as a results-first archive: Grand Final → Battle for 3rd → Semifinal → Quarterfinal → newest group/round-robin series → oldest series. Filtering and pagination preserve that progression ordering.
- The Admin Dashboard live-scoring overview is organized by court wave rather than exhausting one court at a time: each court's next unfinished matchup appears before the second unfinished matchup on any court, then the next wave follows. Completed/forfeited work remains below active operations.
- MVP is now stage-weighted and contribution-first. Group wins provide the baseline; knockout appearances carry a smaller participation value because playoff lineup slots are limited; knockout wins become progressively more valuable through QF, SF, Battle for 3rd, and Grand Final. Team progression contributes only a small cumulative bonus, with an additional small champion bonus, so actual individual playoff participation and wins dominate the ranking. Ties prefer higher-stage wins before total wins, match volume, and point differential.
- Fan Favorite supports scheduled **public code drops** through `VotingCodeBatch`. Existing manual/printable voting codes remain hash-only. Only codes intentionally generated for a public drop retain plaintext in `VotingCode.publicCode`, linked to their batch; future batch codes are hidden and rejected by the vote API until their server-side release time.
- The public Fan Favorite page has separate **Vote** and **Codes** tabs. Released unused codes appear automatically, support one-tap copy/use, and disappear within the short visibility-aware polling interval after successful consumption. Released leftovers remain visible until actually used even when a newer batch is released.
- Public code consumption remains transactionally one-time and serializable. The existing atomic status update protects against two spectators consuming the same code concurrently; scheduled/cancelled batch state is also checked server-side.
- Admin Voting is now an operational **Voting & Code Drops** workspace: schedule a 1–500 code batch at a Philippine-local release time, release a future batch immediately, cancel an unreleased batch, view current depletion, and keep legacy manual/printable codes in a collapsed secondary section.
- Live admin code-drop metrics include used/remaining codes, codes per minute, elapsed/sell-out time, time to 50% consumption, and simple fast/slow guidance for sizing the next batch. A compact team-distribution horizontal bar view shows Fan Favorite vote share for every tournament team, including teams currently at zero.
- `VotingCodeBatch` and public-code metadata participate in snapshots, restore, activity/factory resets, and voting simulation cleanup. Migration `20260817170000_fan_favorite_code_batches` is additive and preserves all existing voting codes/votes.


## MVP SOS + Fan Favorite usability + live-countdown placement — 2026-08-18

- MVP weights now reduce overlapping raw Wins from 15% to 10% and raise Strength of Schedule from 15% to 20%; all other weights remain unchanged.
- SOS now uses the pooled adjusted record of **all opponents faced**, not only opponents beaten. Each opponent's head-to-head result(s) against the candidate are removed before pooling the remaining opponent wins/losses, so opponents with more independent results naturally contribute more evidence.
- Fan Favorite uses a wider desktop canvas, wider ballot-vs-leader allocation, wrapping player names instead of aggressive truncation, explicit male/female selections (no randomized first-row auto-selection), clearer selection steps, and a live Codes-tab status/badge showing available codes and next-drop timing.
- The old site-wide prelaunch countdown gate is removed. The countdown now lives only in the homepage Live Courts slot and is overridden immediately by any actual live/interrupted match, including pre-tournament testing.
