# Official Match Scorecard Printing

The admin can print official paper scorecards after both teams submit complete lineups for a matchup.

## Workflow

1. Both team leaders submit the exact number of playing pairs required by that matchup, selecting players directly from their confirmed team roster.
   - Team Event group play can use 7 pairs.
   - Team Event knockout play can use 5 pairs when configured that way.
2. The lineup transaction creates one `Game` per lineup slot and marks the matchup `READY`.
3. In **Admin Dashboard** or **Tournament Setup → Schedule**, open **Scorecards / Print scorecards**.
4. Review the auto-filled team names, players, round, group/bracket, and court.
5. Group/bracket, round, and court can be overridden for the printout without changing tournament data.
6. Use **Print all scorecards** for the complete matchup or select one game and print only that card.

## Paper layout

- A4 landscape
- two compact scorecards side-by-side per physical sheet
- a 7-game matchup uses 4 sheets (2 + 2 + 2 + 1)
- a 5-game matchup uses 3 sheets (2 + 2 + 1)
- the final odd card is centered on its sheet
- team and player names come from the latest submitted lineups
- starting/ending time, score, representative signatures, and umpire signature remain writable on paper unless a recorded result already exists

If a lineup changes before scoring, the app recreates the future games from the latest pair order. Previously printed cards can therefore become stale; re-open the scorecard page and reprint affected cards after any lineup change. The printed footer includes a generation timestamp to help staff identify older copies.
