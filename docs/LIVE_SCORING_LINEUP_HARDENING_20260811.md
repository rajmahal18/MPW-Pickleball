# Live scoring and lineup hardening — 2026-08-11

## Current operating rules

- Live point controls save in place. Normal +1/-1 scoring must not navigate or refresh the page.
- Point-by-point writes create `ScoreEvent` history, but a full tournament recalculation is reserved for result-changing actions such as finalization/reopen/forfeit/correction of a decided game.
- Public live views poll compact JSON endpoints rather than refreshing the full React Server Component page.
- A decided pair match immediately recalculates the parent team matchup series. Group standings consume the live `homeWins/awayWins` counters for Matches/W/L and decided-match scores for NPD/TP even before the full team matchup is terminal.
- Standings tie labels remain provisional/hidden while any matchup in that group table is pending; exact ties become actionable only after the group table is complete.
- Result-heavy pages use revision-triggered refreshes, so finalized games propagate across open standings/bracket/admin overview screens without returning to per-rally full-page refreshes.
- The homepage uses one batched live-games poll, not one poll per court card.
- Team Event pairs are matchup-specific lineup selections from the confirmed team roster. The `Pair` record remains an internal/historical compatibility record for the current schema; it is not a permanent manager-facing pairing assignment.
- A lineup slot is protected only when its corresponding game has started/recorded play. Other future slots stay editable.
- Player/team/eligibility changes invalidate only affected future lineup slots and preserve recorded history. Related cleanup is performed transactionally with the master-data change.
- Scorecards are considered ready only when both lineups are complete and every generated Game pair reference matches the current lineup slot.

## Live scoring UX

Admin scoring offers:

- in-place +1/-1 controls with optimistic visual feedback;
- Start, Interrupt, Finalize, Reopen, exact score correction, and forfeit controls without normal-page redirects;
- direct navigation among the games inside the same team matchup;
- explicit concurrent-update errors instead of overwriting another scorer's newer state.

## Lineup UX

Team leaders choose Player 1 + Player 2 for each required game directly from their roster.

- Group-stage 7-game matchups can use all 14 eligible roster players.
- A 5-game knockout intentionally requires selection of 10 players; the UI must not guess which four roster players sit out.
- The same player cannot be used twice in one matchup lineup.
- Saved future slots may be changed until that specific game starts.

## Final QA before production

1. Score a live game point-by-point and confirm the page never reloads.
2. Open the public matchup and homepage on another device and confirm scores update in place.
3. Submit both team lineups and confirm generated games align slot-for-slot.
4. Start Game 1, then edit Game 2+ lineup slots; Game 1 must remain protected while future slots save.
5. Change an unplayed player's team/eligibility and confirm only affected future lineup usage is reopened.
6. Confirm scorecards disappear when lineup/game references are stale and return after the lineup is completed again.
7. Finalize Match 1 of an unfinished team matchup and confirm the parent series plus standings Matches/W/L/NPD/TP update on other open result pages. NPD and TP must use decided pair matches only.
8. Confirm a fresh 0-0-0 group does not show `Tie`; exact `T#` ties should appear only after every matchup in that group table is terminal.
9. Complete the team matchup and confirm full standings/qualification/bracket recalculation still occurs.
