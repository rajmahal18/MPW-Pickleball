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
| Wins | 10% | `wins / most wins in the same sex category * 100` |
| Win rate | 20% | `wins / matches played * 100` |
| Participation / trust | 10% | `matches played / most matches played in the same sex category * 100` |
| Playoff impact | 20% | `player playoff leverage / highest current playoff leverage in the same sex category * 100` |
| Strength of schedule | 17.5% | Pooled record of all opponents faced against the rest of the field |
| Point differential | 17.5% | Average point differential mapped to 0-100; even differential is 50 and the configured +/- cap maps to 0/100 |
| Team finish | 5% | QF 35, SF 55, 3rd 65, finalist 75, champion 100 |

`MVP Index = 0.10(Wins) + 0.20(Win Rate) + 0.10(Participation) + 0.20(Playoff Impact) + 0.175(SOS) + 0.175(Point Differential) + 0.05(Team Finish)`

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

Strength of Schedule uses **every opponent faced**, regardless of whether the candidate won or lost. For each opponent, the system removes that opponent's head-to-head match(es) against the candidate, then pools the opponent's remaining wins and losses with the rest of the candidate's opponents.

`SOS = pooled adjusted opponent wins / (pooled adjusted opponent wins + pooled adjusted opponent losses) * 100`

This is intentionally a **collective record**, not an equal average of opponent percentages. An opponent with four independent results therefore contributes more evidence than an opponent with only one independent result. If an opponent has no other completed match after removing the head-to-head, that opponent contributes no SOS evidence yet.

A loss against a strong opponent still counts normally in Wins/Win Rate, but the difficult schedule is recognized by SOS. Point Differential separately distinguishes a close loss from a heavy loss.

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
