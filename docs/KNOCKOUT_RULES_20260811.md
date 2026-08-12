# Knockout rules hardening — 2026-08-11

## Team Event configuration

For the current Team Event, set:

- Group / default games per matchup: **7**
- Knockout games per matchup: **5**
- Battle for 3rd: **enabled** if the official format includes bronze
- Sudden death at 10-10: toggle according to the organizer's official scoring rule

The five-game knockout setting means team leaders submit five active pair slots for QF, SF, Battle for 3rd, and Grand Final. The seven master pairs remain available; only the required five are selected for that matchup.

## History protection

Changing a game count on an unplayed matchup clears generated games and submitted lineups so the new count cannot conflict with stale pair slots. Any matchup with recorded play is protected and keeps its original game count/results.

## Battle for 3rd

When automatic group-to-knockout progression is active and a Battle for 3rd is enabled, the system creates one `THIRD_PLACE` matchup and fills it with the two semifinal losers as soon as those semifinal results are known.

## Sudden death

Normal mode requires at least 11 points and a two-point winning margin. With sudden death at 10-10 enabled, 11-10 is a valid completed score.

## Printing

Official matchup scorecards use A4 landscape with two scorecards side-by-side per physical sheet. The compact scorecard is intentionally shorter than the full printable page so two cards remain readable without excessive vertical whitespace.

## Team Event semifinal feed

For the current 8-qualifier Team Event, the supplied organizer schedule is used: Semifinal 1 receives the winners of QF1 and QF3; Semifinal 2 receives the winners of QF2 and QF4. The public bracket reorders completed feeder cards visually when necessary so connector lines remain readable without changing matchup identity/order.
