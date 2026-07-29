# MVP Statistical Formula

The tracker provides separate **Male MVP** and **Female MVP** rankings. It uses completed or forfeited games only. It does not ask judges to enter manual 1–5 ratings.

## Default weights

The maintainable constants are in `lib/tournament/config.ts`:

| Component | Weight |
|---|---:|
| Win rate | 40 |
| Average point differential | 25 |
| Strength of schedule | 20 |
| Quality wins | 10 |
| Consistency | 5 |

## Calculation

For every player, the system aggregates:

- games played, wins, losses, and win percentage;
- total and average point differential;
- opponents' observed win rates for strength of schedule;
- wins against opponents with at least a 60% observed win rate;
- variation in game margins for consistency;
- participation confidence, reaching full confidence at four games by default.

Each normalized component contributes its configured weight. The raw weighted score is multiplied by a confidence factor from 0.65 to 1.00, reducing small-sample certainty without deleting early results.

The page shows the MVP Index and the component breakdown so judges can see why a player ranks where they do.

## Locked-pair limitation

When two players always compete as one locked pair, result data cannot identify which individual carried the pair. Both players receive the same pair-derived game inputs. The UI labels this condition and tells judges that the numbers support, but do not replace, the eye test.

Partner rotation can create more informative individual samples because a player's results span multiple pair IDs and partners; the current formula still deliberately avoids claiming unsupported shot-level precision.
