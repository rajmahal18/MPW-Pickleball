# Knockout rules hardening — 2026-08-11

## Team Event configuration

For the current Team Event, set:

- Group / default matches per team matchup: **7**
- Knockout matches per team matchup: **5**
- Battle for 3rd: **enabled** if the official format includes bronze
- Sudden death at 10-10: toggle according to the organizer's official scoring rule

The five-match knockout setting means team leaders submit five active pair slots for QF, SF, Battle for 3rd, and Grand Final. The seven master pairs remain available; only the required five are selected for that matchup.

## Group standings and official tiebreaks

The visible group standings columns are:

- `P` — team matchups played
- `W` — team matchups won
- `L` — team matchups lost
- `NPD` — Net Point Differential, computed as total points scored minus total points conceded across decided pair matches
- `TP` — Total Points Scored across decided pair matches

Pair-match wins are still tracked even though they are not shown as a separate standings column. After the team-matchup W/L record, tied teams are ranked using the organizer's required sequence:

A. **Total Pair Match Wins**
B. **Net Point Differential** — Total Points Scored − Total Points Conceded across the pair matches
C. **Head-to-head result** between the teams still tied after A and B
D. **Total Points Scored**

If teams remain mathematically tied after all of the automatic criteria and the group stage is complete, the existing organizer tiebreak override remains available. Cross-group wildcard comparison cannot use head-to-head, so it uses team-matchup record, pair-match wins, NPD, then total points scored.

## History protection

Changing a match count on an unplayed team matchup clears generated matches and submitted lineups so the new count cannot conflict with stale pair slots. Any team matchup with recorded play is protected and keeps its original match count/results.

## Battle for 3rd

When automatic group-to-knockout progression is active and a Battle for 3rd is enabled, the system creates one `THIRD_PLACE` matchup and fills it with the two semifinal losers as soon as those semifinal results are known.

## Sudden death

Normal mode requires at least 11 points and a two-point winning margin. With sudden death at 10-10 enabled, 11-10 is a valid completed score.

## Printing

Official scorecards use A4 landscape with two portrait scorecards side-by-side per physical sheet. Each card uses the available printable height, while the umpire band is deliberately kept compact so handwriting space is concentrated on player, score, and representative-signature fields. Group identity is derived from the configured round/matchup rather than entered as a separate scorecard field.

## Team Event semifinal feed

For the current 8-qualifier Team Event, the supplied organizer schedule is used: Semifinal 1 receives the winners of QF1 and QF3; Semifinal 2 receives the winners of QF2 and QF4. The public bracket reorders completed feeder cards visually when necessary so connector lines remain readable without changing matchup identity/order.
