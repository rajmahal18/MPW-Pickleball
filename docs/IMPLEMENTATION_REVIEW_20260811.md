# MPW Tournament – Scorecard and UX Reliability Pass (2026-08-11)

## Scope

This pass focused on tournament-day usability and reliability without changing the tournament's scoring rules or resetting data.

## Implemented

### Official printable scorecards

- Added an admin scorecard preview route at `/admin/matches/[id]/scorecards`.
- Scorecards become printable when both teams have submitted complete lineups and the expected games have been generated.
- Uses the generated game/pair records, so the printed Player 1 / Player 2 names match the latest submitted lineup.
- A4 landscape print layout, two scorecards per sheet. Seven games produce four sheets; a final single card is centered.
- Group/bracket, round, and court can be adjusted for the print preview without mutating tournament records.
- Supports printing the whole matchup or one game only for replacement/reprint needs.
- Team/player names are allowed to wrap rather than being silently truncated on paper.
- No rule such as a hard-coded `11-0` forfeit score was added; the old scorecard was treated as a visual reference only.

### Standings readability

- Rebalanced standings column widths so compact numeric fields do not consume the team-name column.
- Team names wrap on normal word boundaries rather than breaking into narrow character fragments.
- Public group-card grids use two columns at large desktop widths instead of forcing three narrow standings tables side by side.
- Cards use `min-w-0`/overflow containment to avoid accidental page-level horizontal overflow.

### Tournament-day UX / load reduction

- Reduced redundant full-page auto-refresh pressure on public pages. Live game cards retain their lightweight per-game polling while heavier server-rendered pages refresh less aggressively.
- Added invalid-page guards to Players, Games, and Admin Audit pagination so stale or hand-edited high page numbers redirect to the last valid page instead of showing a misleading empty state.
- Team Leader dashboard now distinguishes: lineup still needed, own lineup saved/waiting for opponent, and both lineups complete/scorecards ready.
- Admin Overview and Tournament Setup surface a scorecard link only when the expected games exist.

## Data and schema impact

- No Prisma schema migration was required.
- No production data is modified by opening or printing scorecards.
- Print metadata overrides are URL/query-only and intentionally do not overwrite the official matchup configuration.

## Validation in this sandbox

- All TS/TSX source files were syntax-transpiled with the available TypeScript compiler with zero syntax diagnostics.
- Internal `@/` import targets were checked and no missing local imports were found.
- A full Next.js/Prisma build could not be run in this sandbox because dependencies are not installed and the environment's npm registry is configured as the invalid `https:///` URL.

Before production, run the repository's normal verification/build commands in an environment with dependencies installed.
