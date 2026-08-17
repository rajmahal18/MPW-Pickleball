# MVP Statistical Formula

The tracker provides separate **Male MVP** and **Female MVP** rankings. It uses completed or forfeited pair matches only and rewards actual tournament contribution, with progressively higher value in higher-stakes playoff stages.

## Individual stage points

The maintainable constants are in `lib/tournament/config.ts`.

| Stage | Played | Win bonus | Total for a win |
|---|---:|---:|---:|
| Group / round robin | 0 | 1.00 | 1.00 |
| Quarterfinal | 0.50 | 1.50 | 2.00 |
| Semifinal | 0.75 | 2.25 | 3.00 |
| Battle for 3rd | 1.00 | 2.50 | 3.50 |
| Grand Final | 1.50 | 3.50 | 5.00 |

A playoff appearance carries merit because knockout lineups have fewer available pair slots. A win adds substantially more merit, and the reward grows as the player performs deeper in the tournament.

## Small team-progression bonus

A player also receives a deliberately small bonus when their team reaches a knockout stage:

- Quarterfinal: +0.25
- Semifinal: +0.50
- Battle for 3rd: +0.75
- Grand Final: +1.25
- Champion: additional +0.50

These bonuses are cumulative, but they are intentionally much smaller than actual individual playoff appearances and wins. Reaching a deep stage helps; being selected and delivering in that stage matters much more.

## Ranking and tiebreaks

`MVP points = individual stage points + team-stage bonus + champion bonus`.

If players have the same MVP points, the system compares:

1. wins at the highest stage first (Grand Final, then Battle for 3rd, Semifinal, Quarterfinal, then group play);
2. total pair-match wins;
3. matches played;
4. total point differential;
5. player name only as a deterministic final ordering.

The MVP page also exposes playoff appearances, playoff wins, stage points, team-run bonus, win rate, average differential, and highest-stage win so the ranking remains easy to explain.

## Locked-pair limitation

When two players always compete as one locked pair, result data cannot identify which individual carried the pair. Both players receive the same pair-derived match inputs. The UI labels this condition; the numbers support, but do not replace, the eye test.
