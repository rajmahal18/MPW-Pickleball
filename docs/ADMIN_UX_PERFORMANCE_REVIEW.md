# Admin UX and Performance Review

Date: 2026-08-11

## What made the admin feel broken

The production-mode logs bundled with the repository show that the complaint was real rather than a development-only perception. `/admin/players` repeatedly took roughly 2–4+ seconds to answer, while `/admin/tournament` was commonly around 1–2 seconds. With no admin loading boundary, a normal Next.js navigation could therefore appear to ignore the first click even though the request was in progress. Opening a route in a new tab hid that wait behind the existing page, which made Ctrl-click feel more reliable.

## Main bottlenecks found

1. Player Pool loaded a large nested dataset and rendered hundreds of full edit forms, repeated team/division selects, and management controls in one page.
2. Tournament Setup eagerly loaded full groups, teams, players, pairs, matchups, games, and player entries for every division even though the operator works on one selected division at a time.
3. Checkpoint history fetched full JSON snapshots even though the list only displays checkpoint metadata.
4. Authentication/session lookup selected more relational data than the admin shell needs and could be called more than once during the same server render.
5. Admin navigation had no active state or route-level loading feedback, so slow server responses looked like dead links.
6. Common player operations required one-record-at-a-time edits. There was no safe batch team assignment, unassignment, attendance update, or division eligibility update.
7. Operational settings, testing tools, and recovery tools competed for attention instead of making the normal tournament workflow obvious.
8. Several mutation controls had no pending state, so a successful click could look like nothing happened while the server was processing it.

## Changes made

- Rebuilt AdminNav as a compact sticky operations bar with active-route state. Primary operations are Overview, Tournament Setup, Player Pool, and Voting; testing/recovery tools are secondary.
- Added `app/admin/loading.tsx` so route transitions immediately show a loading workspace instead of a visually dead click.
- Rebuilt Player Pool into a paginated 40-row operational table with search/filters and a focused per-player edit page.
- Added safe checkbox batch actions for team assignment, return-to-pool, attendance status, and division eligibility. Recorded play and active-pair protections remain enforced.
- Added structured roster fields to the admin editor using the fields already present in the schema: first name, middle initial, last name, optional nickname/display name, employment type, and office/DEO.
- Changed Tournament Setup to fetch only lightweight division summaries first and load full nested data only for the selected division.
- Added jump links for Settings, Groups, Teams/Pairs, and Schedule so configuration areas are one click away.
- Stopped loading checkpoint snapshot JSON on the checkpoint listing page.
- Narrowed several Prisma selects on Dashboard, Voting, Simulation, Checkpoints, and Audit; Audit now pages 50 records at a time.
- Memoized the current-user lookup for a server render and reduced its selected relations.
- Added visible pending states to admin mutations, including scoring, voting, reset, checkpoint, simulation, and dashboard controls.
- Centralized admin name rendering on the existing player-name helper where touched, preserving middle initials and optional nicknames.

## Safety boundaries preserved

- Batch actions are tournament-scoped.
- Moving players is blocked when recorded play would make historical reassignment unsafe.
- Active pairs must be deactivated before team movement.
- Started/completed history remains protected by the existing tournament rules.
- No production data was modified by this review.
- No Prisma schema migration was required for this admin pass; the structured player fields already exist.

## Validation performed in this workspace

- Syntax/transpile pass across all TypeScript/TSX source files: passed.
- Local `@/` and relative import resolution check: passed.
- Full dependency-backed typecheck/build could not be completed in this sandbox because its npm registry configuration resolves to an invalid `https:///` registry and dependency installation did not complete. Run the repository's normal typecheck/build in the target development environment before deployment.
