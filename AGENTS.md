# Codex / Agent Rules — MPW Pickleball

Read this file before modifying tournament behavior.

## North star

**The system adapts to the tournament. Do not force the tournament to adapt to a hardcoded bracket.**

Short-notice organizer changes are a normal operating condition, especially for Executive divisions.

## Non-negotiable rules

1. **Do not hardcode the original tournament format.**
   - `3 groups`, `12 teams`, `7 pairs`, `7 pair matches`, `4 qualifiers`, `2 semifinals`, etc. are sample Open configuration values only.
   - Any feature that needs these numbers must read them from Division/Group/Team/Matchup data.

2. **Player pool first.**
   - A Player may exist with `teamId = null`.
   - Do not require a team when adding a player.
   - Attendance/participation status and division eligibility are independent from team assignment.

3. **Executive attendance is uncertain by design.**
   - Treat late confirmations, no-shows, withdrawals, pair changes, group changes, and canceled unplayed teams as ordinary flows.
   - Prefer admin actions that can be completed through UI, not direct SQL/Prisma Studio.
   - Removing an unplayed team must return its players to the pool; never delete Player records as cleanup.

4. **Protect recorded history.**
   - Never silently rewrite competitors/pairs/match counts of a matchup after recorded play exists.
   - Future/unplayed matchups may be regenerated or edited.
   - Completed results remain the source of truth for MVP/statistics.

5. **Actual participation matters.**
   - Fan Favorite eligibility requires an active, confirmed, assigned player.
   - MVP remains derived from actual completed/forfeited pair matches, not mere registration.
   - Do not count a player as having played just because they exist in the pool or were once assigned.

6. **Keep unrelated features intact.**
   - Do not remove or weaken MVP, Fan Favorite, scoring, audit logs, checkpoints/undo, simulation, avatars, public pages, or team-leader lineups unless a requested change explicitly involves them.

7. **Dynamic public guidance.**
   - `/format` must describe the live Division/Matchup configuration.
   - Do not restore static prose that claims a specific number of groups, teams, matches, or qualifiers.

8. **Division-aware queries.**
   - Orders, stages, rounds, standings, rollback scopes, simulation scopes, and public grouping must not accidentally merge separate divisions.
   - Respect `Division.isPublic` on every public page/API. Tentative `POOL` players are admin-only.

9. **Safe automation, manual escape hatch.**
   - Automatic progression should only run when the configured structure is explicitly supported.
   - Unsupported/custom structures must remain editable instead of being guessed.

10. **Migrations must preserve live data.**
    - Use additive/backfill migrations for production data.
    - Do not replace migrations with `db push`.

11. **Public discovery should be low-friction and context-aware.**
    - Public search/filter controls auto-apply; text search uses a short debounce instead of requiring an Apply button.
    - Dependent choices should narrow to valid context where practical (for example, selected Team → only that team's players and matchups). Never silently fabricate a selection.

12. **Admin UX must stay operational, not database-like.**
    - Tournament Setup follows the visible workflow **Division → Teams & Groups → Lineup Rules → Courts → Matchups**. Do not reintroduce a separate duplicate team-placement section or always-visible bulk/dev-helper panel.
    - Court queue controls are tournament-day controls and must update in place without full-page navigation.
    - Player Pool should stay attendance-first with filters and scannable statuses.
    - Technical/developer tools may remain available but should not compete with normal tournament-day navigation.
    - See `docs/UI_UX_GUIDELINES.md` before changing admin setup/player-pool UI.

## Current supported format primitives

- Division formats: `GROUP_KNOCKOUT`, `ROUND_ROBIN`, `SINGLE_ELIMINATION`, `CUSTOM`
- Matchup stages: `GROUP`, `ROUND_ROBIN`, `QUARTERFINAL`, `SEMIFINAL`, `FINAL`, `THIRD_PLACE`, `CUSTOM`
- User-facing terminology is **Match / Matches**. Prisma `Game`, `/games`, and `gamesPerMatchup` remain legacy internal identifiers only; do not reintroduce “game” in UI copy.
- `gamesPerMatchup` stores the configurable **pair-match count** per team matchup. Division settings may define a group/default count and a separate knockout count; unplayed knockout matchups may sync to the knockout count while recorded history stays locked.
- Divisions may enable a Battle for 3rd, populated from semifinal losers when automatic progression is supported.
- Stage scoring is fixed for the current tournament direction: GROUP/ROUND_ROBIN is first to 11 with sudden death at 10-10 (11-10 is final); QF/SF/Final/Battle for 3rd is first to 11, win by 2 after 10-10, hard cap 15 (15-14 is final). `suddenDeathAtTen` is retained only for CUSTOM-stage compatibility.
- Team Event playing pairs are **matchup-specific lineup choices from the team roster**. Do not require organizers to pre-create/permanently lock seven pair combinations. `Pair` rows may act as technical/historical snapshots for lineup/match compatibility; only a pair match with recorded play protects that specific slot.
- Live score point controls must save in place. Do not reintroduce redirect/full-page refresh behavior for each +1/-1 action, and do not recalculate the full tournament on every rally.
- Knockout team matchups end as soon as one side reaches a majority of configured pair matches (5 => first to 3). Do not require or simulate the remaining untouched slots after a clinch; group/round-robin matchups still play all configured pair matches.
- Simulation must use the same stage scoring, lineup-category, duplicate-player, and early-clinch rules as real tournament operation.
- Auto group-to-knockout progression supports exactly 2, 4, or 8 selected qualifiers today.
- Other qualifier counts/structures require organizer-controlled future matchups.

## Before finishing a change

- Search for new numeric/bracket assumptions.
- Verify all player queries tolerate `teamId = null` where appropriate.
- Verify a change in one division cannot affect another division accidentally, including simulation/reset helpers.
- Verify private divisions and tentative player-pool names cannot leak through public detail/API routes.
- Verify started/completed pair-match history cannot be silently rewritten.
- Verify Fan Favorite and MVP still work.
- Update `PROJECT_STATE.md` when architecture/constraints materially change.
