# Flexible Tournament Architecture

## Why this exists

MPW tournament details can change very close to game time. Executive attendance is especially uncertain. The application therefore treats a tournament as configurable data rather than a fixed bracket encoded in React/API logic.

## Entity flow

```text
Tournament
  └─ Division (Open / Executive / future category)
       ├─ optional Groups
       ├─ Teams / competition units
       ├─ Matchups
       └─ DivisionPlayer eligibility

Player Pool
  ├─ participation status
  ├─ zero or more DivisionPlayer eligibility records
  └─ optional active Team assignment
       └─ Pair
            └─ LineupSlot
                 └─ Game appearance
```

A Player record means “known possible participant,” not “this person definitely played.”

## Player lifecycle

Recommended progression:

```text
POOL
  -> CONFIRMED
  -> assigned to Team (optional until known)
  -> confirmed for Division
  -> included in active Pair
  -> submitted in Lineup
  -> appears in Game
```

`UNAVAILABLE` / `WITHDRAWN` may happen at short notice. When attendance changes before play, affected future lineups are reopened. Historical games are not rewritten.

## Team meaning

For the Team Event, a Team contains its roster and each matchup receives a fresh lineup of playing pairs selected from that roster. Pair rows are implementation/history records, not permanent seven-pair locks.

For an Executive doubles bracket, a Team can simply be a **pair unit** containing two players + one active Pair, with `gamesPerMatchup = 1`.

This lets the existing scoring/MVP/Fan Favorite infrastructure work without creating a second unrelated bracket engine.

## Division configuration

Each Division owns:

- `formatType`
- `defaultGamesPerMatchup`
- `qualifiersPerGroup`
- `wildcardCount`
- `autoProgression`
- `advancementRule`
- `guideNotes`
- groups, teams, matchups, and player eligibility

The human-readable public guide is built from these records plus actual configured matchups.

## Matchup mutability rule

### Future/unplayed

Admin may change:

- division/stage
- group/scope label
- home/away teams
- games per matchup
- round label
- court
- schedule
- or delete the matchup

Changing future structure clears stale lineups/games so team leaders cannot accidentally play an obsolete configuration. Moving an unplayed team between groups/divisions also clears that team from affected future matchup slots; if the division changes, its member eligibility is synced to the new division. An unplayed team may be removed entirely; its players return to the pool while only future matchup references are cleared. An unplayed group may also be removed, which ungroups its teams and removes only that group’s future matchups.

### Recorded play exists

Competitors, stage, and game-count structure are locked. Safe metadata (round/court/schedule) may still be corrected.

Recorded play means a game is live/completed/forfeited/interrupted or has a non-zero score.

## Automatic progression

`GROUP_KNOCKOUT + autoProgression=true` can select qualifiers using configured group slots + wildcards.

Current automatic bracket shapes:

- 2 qualifiers -> Final
- 4 qualifiers -> Semifinals -> Final
- 8 qualifiers -> Quarterfinals -> Semifinals -> Final

Anything else is deliberately left organizer-controlled. Do not “invent” a bracket shape for unsupported counts.

## Tie behavior

Because game counts are configurable, a team matchup can have an even number of games. A completed tied matchup therefore has `winnerTeamId = null`; the engine must not arbitrarily assign the away team as winner. Organizers can resolve custom/knockout tie rules through a future explicit rule or manual correction.

## Dynamic guide contract

`lib/tournament/format-guide.ts` is the source for public format prose. Public copy should describe:

- current format type
- actual groups/teams
- current default games per matchup
- configured qualifier/wildcard rules
- confirmed vs assigned players
- actual configured stages/matchup counts
- automatic vs organizer-controlled progression
- organizer notes

Do not duplicate those facts as static marketing text elsewhere.

## Group identity and rename rule

Group-stage standings currently associate configured Groups with `Matchup.groupLabel`. Renaming a Group through Tournament Setup therefore updates the matching group-stage labels in the same division as one transaction. Do not implement a raw group-name edit that leaves old matchup labels behind.

## Recovery invariants

- Granular undo must include `divisionId` in round/stage scope.
- Resets must preserve organizer-defined divisions/groups/teams/matchups unless the reset explicitly says it destroys them.
- Activity checkpoint restore may restore old matchup records, but does not revert Division/Player/Team master-data changes. A restore aborts safely if a referenced team has since moved to a different division.

## Extension points

Future improvements can add, without breaking this model:

- explicit bye support
- configurable tie-resolution rules
- richer bracket dependency graph instead of supported 2/4/8 shapes
- multiple simultaneous team memberships per player if MPW later needs the same person actively competing in multiple divisions
- drag/drop seeding UI
- per-division scoring rules

Any such change must preserve the recorded-history rule.


## Public visibility contract

`Division.isPublic` is a real boundary, not just a label. Public group, team, matchup, game API, MVP, and player-directory queries must exclude private divisions. The admin Player Pool may contain tentative `POOL` candidates, but the public `/players` page only exposes confirmed players confirmed for at least one public division.
