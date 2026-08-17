# Official Match Scorecard Printing

The admin can print official paper scorecards after both teams submit complete lineups for a team matchup.

## Workflow

1. Both team leaders submit the exact number of playing pairs required by that matchup, selecting players directly from their confirmed team roster.
   - Team Event group play can use 7 pair matches.
   - Team Event knockout play can use 5 pair matches when configured that way.
2. The lineup transaction creates one internal match record per lineup slot and marks the team matchup `READY`.
3. In **Admin Dashboard** or **Tournament Setup → Schedule**, open **Scorecards / Print scorecards**.
4. Review the auto-filled team names, players, round, and court. Group identity comes from the configured round/matchup and is not entered separately on the scorecard.
5. Round and court can be overridden for the printout without changing tournament data.
6. Use **Print all scorecards** for the complete team matchup or select one match and print only that card.

## Paper layout

- **A4 portrait** sheet.
- The sheet is divided **crosswise / horizontally** into two equal working areas.
- Two **landscape scorecards** are stacked top-and-bottom on each physical A4 sheet.
- A dashed center cut guide separates the two scorecards.
- A 7-match team matchup uses 4 sheets (2 + 2 + 2 + 1).
- A 5-match team matchup uses 3 sheets (2 + 2 + 1).
- If the final sheet has only one scorecard, it stays in the upper half; it never expands into a wasteful full-page card.
- The umpire/signature areas are intentionally compact so player names, scoring, and representative signatures remain usable within a half-sheet scorecard.
- Team and player names come from the latest submitted lineups.
- Starting/ending time, score, representative signatures, and umpire signature remain writable on paper unless a recorded result already exists.

If a lineup changes before scoring, the app recreates the future matches from the latest pair order. Previously printed cards can therefore become stale; re-open the scorecard page and reprint affected cards after any lineup change. The printed footer includes a generation timestamp to help staff identify older copies.
