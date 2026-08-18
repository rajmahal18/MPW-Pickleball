# MVP Index Formula

The tournament exposes **Male MVP** and/or **Female MVP** rankings according to each public event/division. Team Event can show both; sex-specific Executive events show only the applicable award. Rankings are calculated from completed or forfeited pair matches only. The public MVP page shows the same factor scores, weights, and weighted contributions used by the system so the result can be audited instead of treated as a black box.

## Eligibility and provisional rankings

- The **MVP Index is always calculated** as soon as a player has a completed match.
- A player needs at least **3 completed matches** to be formally MVP-eligible.
- Before any player in a sex category reaches 3 matches, the ranking remains visible and is labeled **Provisional**.
- Once at least one player in that category is formally eligible, eligible players are ranked ahead of players who have not yet reached the minimum.

This keeps the MVP race visible early without allowing a tiny 1-0 or 2-0 sample to become the final award winner once qualified candidates exist.

## MVP Index

Each factor is normalized to a 0-100 component score. The final Index is also on a 0-100 scale.

| Factor | Weight | Component score |
|---|---:|---|
| Wins | 15% | `wins / most wins in the same sex category * 100` |
| Win rate | 20% | `wins / matches played * 100` |
| Participation / trust | 10% | `matches played / most matches played in the same sex category * 100` |
| Playoff impact | 20% | `player playoff leverage / highest current playoff leverage in the same sex category * 100` |
| Strength of schedule | 15% | Average tournament win rate of the opponent players beaten |
| Point differential | 15% | Average point differential mapped to 0-100; even differential is 50 and the configured +/- cap maps to 0/100 |
| Team finish | 5% | QF 35, SF 55, 3rd 65, finalist 75, champion 100 |

`MVP Index = 0.15(Wins) + 0.20(Win Rate) + 0.10(Participation) + 0.20(Playoff Impact) + 0.15(SOS) + 0.15(Point Differential) + 0.05(Team Finish)`

The category-relative components are intentionally normalized **within Male or Female**, because the two awards are separate races.

## Playoff impact

Playoff credit is earned only when the player actually appears in that match. Team advancement by itself does not create playoff-impact points.

| Stage | Appearance leverage | Win leverage | Total for a win |
|---|---:|---:|---:|
| Group / round robin | 0 | 0 | 0 |
| Quarterfinal | 1 | 1 | 2 |
| Semifinal | 2 | 2 | 4 |
| Battle for 3rd | 2 | 2 | 4 |
| Grand Final | 3 | 3 | 6 |

This makes a player who is repeatedly trusted and delivers deep in the bracket more valuable than someone who merely belongs to a team that advanced.

## Strength of schedule

Only **wins** contribute opponent-strength credit. For every opponent player defeated, the system looks at that opponent's tournament win rate in the selected event and averages those values. Beating opponents who themselves performed well therefore adds more merit than compiling the same record against a weaker schedule.

## Point differential

The system uses **average** point differential rather than total differential so extra matches do not automatically inflate this component. With the current configured cap of +/-15:

- average `+15` or better -> 100
- average `0` -> 50
- average `-15` or worse -> 0

This rewards convincing wins while distinguishing close losses from heavy losses.

## Team finish is deliberately small

Team finish is only **5%** of the Index. Winning the tournament helps, but it cannot by itself make a weak individual record the MVP. A player from a non-champion team can win if their wins, efficiency, playoff performance, opponent quality, and margins are strong enough.

## Locked-pair organizer selection

A fixed/locked pair can produce two players with exactly the same measurable inputs and therefore the exact same MVP Index. When the top two candidates are the same locked pair with an identical record and Index, the system **does not invent an artificial decimal tiebreaker**.

In that one case, the **Superadmin** can select which partner receives the award. The public MVP result is marked **Selected by organizers**. If there is a clear statistical leader, there is no manual organizer override.
