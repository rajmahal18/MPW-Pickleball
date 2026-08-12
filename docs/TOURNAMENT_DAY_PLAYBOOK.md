# Tournament-Day Playbook

This document explains how the flexible model is intended to be used by organizers.

## Scenario: Executive attendance is still uncertain

1. Add names to **Admin → Player Pool** as `POOL`.
2. Add Executive Men/Women eligibility if useful; do not invent teams yet.
3. As people confirm attendance, change participation to `CONFIRMED` and division status to `CONFIRMED`.
4. Leave no-shows as `UNAVAILABLE` or `WITHDRAWN`.

No fake team or bracket slot is required just because a name exists in the database. Tentative pool names remain admin-only until confirmed for a public division.

## Scenario: Two executives arrive and will play together

Use **Quick Pair Unit**:

1. Choose the Executive division.
2. Select two confirmed, unassigned players.
3. Enter pair/team name + short name.
4. Submit.

The app creates the Team competition unit, assigns both players, confirms their division entries, and creates the active Pair in one transaction.

## Scenario: Final Executive format is announced 10 minutes before start

Go to **Admin → Tournament Setup**.

- Round robin: keep teams ungrouped and use **Generate division round robin**.
- Group stage: create groups, move teams into them, then generate each group's round robin.
- Knockout/custom: create future matchups and assign teams as required.
- Change `gamesPerMatchup` per division or per individual matchup.
- Edit round, court, scope label, and schedule at any time before scoring.

Then verify `/format` and `/bracket` publicly. Keep the division unchecked as **Public** until organizers are ready to expose it.

## Scenario: Player no-show after a lineup was prepared

If scoring has **not** started:

1. Change the player's participation/division status.
2. The app invalidates affected future lineup/game records.
3. Re-pair/reassign as needed.
4. Team leader submits the revised lineup.

If the player already has recorded play, historical games stay untouched. Future eligibility can still be changed.

## Scenario: Organizer changes future matchup

From **Tournament Setup**, edit the future matchup. The app clears obsolete future lineup/game records and reopens it for lineup submission.

Once recorded play exists, competitor/stage/game-count fields are protected.

## Scenario: Bad score or operational mistake

Use existing scoring correction / undo / checkpoint tools. Granular round/stage rollback is division-aware, so an Executive rollback does not unintentionally reset Open Division.

## Before going live

- Confirm every Division's public/private state.
- Check player attendance statuses.
- Check Executive pair units.
- Check each matchup's game count.
- Check courts/schedules.
- Open `/format` and make sure the guide matches the organizers' verbal rules.
- Run a test lineup submission for each distinct division style.
- Verify Fan Favorite and MVP pages still load.


## Scenario: Team is moved before play

If organizers reshuffle a team into a different group or division before any recorded play, use **Tournament Setup → Move**. The app removes that team from affected future matchup slots, clears obsolete future lineups/games, and preserves every other team. When moving divisions, current team members receive a matching eligibility record in the destination division.

## Scenario: A planned group or Executive pair unit is canceled before play

From **Tournament Setup**:

- **Remove unplayed group** deletes only that group’s unplayed group-stage matchups and leaves its teams available as ungrouped teams. If recorded play exists, removal is blocked so standings/history remain trustworthy.
- **Remove unplayed team** clears that team from future matchup slots, deletes its no-longer-needed pair unit, and returns its Player records to the unassigned pool. If the team has recorded play, deletion is blocked.
- Group names/slugs may be corrected with **Rename**; linked group matchup labels are updated with the group so standings continue to resolve correctly.

These controls are intended for organizer decisions such as “Executive Pair 4 is no longer playing” or “we are dropping Group C before matches begin.”

## Simulation note

Use **Simulation Center → Division / stage** for generic tournament testing. The older three-way tie/wildcard quick scenarios are retained specifically as legacy Open-sample stress presets and must not be treated as format rules. Their destructive activity reset is scoped to the legacy grouped division, not the entire tournament.
