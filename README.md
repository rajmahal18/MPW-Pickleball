# MPW Pickleball Tournament Platform

A public-facing, live-first tournament platform for MPW Pickleball. The application is intentionally **format-flexible**: divisions, player attendance, team/pair assignment, matchup game counts, group structures, and future schedules can be changed by organizers without a code deployment.

The original 2026 Open setup (3 groups, 12 teams, 7 pair games per team matchup) remains available as **sample/default data only**. It is not an architectural constraint.

## Product rule

> The system adapts to the tournament. The tournament should not have to adapt to the system.

Tournament-day changes are expected. Future/unplayed structure is editable; recorded play is protected.

## Tournament model

- One Tournament can contain multiple independent **Divisions** (Open, Executive Men, Executive Women, or future categories).
- Each division controls its format, default games per matchup, groups, teams, qualification settings, visibility, and progression notes.
- Players begin in a tournament-level **Player Pool** and can be tentative, confirmed, unavailable, or withdrawn.
- Division eligibility/confirmation is tracked separately through `DivisionPlayer`.
- `Player.teamId` is optional. Team/pair assignment is late-bound and should happen only when attendance is known.
- Matchups own `gamesPerMatchup`; there is no global seven-game assumption.
- Group round robins can be regenerated while unplayed. Custom future matchups can be created/edited/deleted directly by admins.
- Started/completed matchups protect competitors, game structure, and history while still allowing safe metadata changes such as court/round/time.
- Group-knockout automatic progression currently supports 2, 4, or 8 qualifiers. Other structures remain organizer-controlled rather than being guessed by code.
- Public `/format` content is generated from current database configuration.

## Preserved capabilities

The flexibility refactor does **not** remove unrelated tournament features:

- Live scoring, score correction, forfeits, interruption state, audit history, and score-event undo
- Team-leader lineup submission with server-side pair/player validation
- Fan Favorite voting codes, rate limiting, printable cards, and live rankings
- Male/Female MVP rankings based on completed games
- Simulation Center
- Checkpoints, restore, granular undo, and reset tooling
- Player avatars
- Public home, groups, standings, bracket, games, teams, players, Fan Favorite, and MVP pages

## Admin workflow for short-notice changes

1. Add possible participants to **Admin → Player Pool** without assigning teams.
2. Mark attendance and division eligibility as information becomes reliable.
3. For Executive doubles, use **Quick Pair Unit** to create a team + two player assignments + active pair in one action.
4. Configure or change the division under **Admin → Tournament Setup**.
5. Generate a round robin or create/edit future matchups manually.
6. Once scoring starts, preserve that history; change only future/unplayed records.

## Codex / future-agent handoff

Read these before making structural tournament changes:

- [`AGENTS.md`](AGENTS.md) — non-negotiable implementation rules
- [`PROJECT_STATE.md`](PROJECT_STATE.md) — current state and remaining boundaries
- [`docs/FLEXIBLE_TOURNAMENT_ARCHITECTURE.md`](docs/FLEXIBLE_TOURNAMENT_ARCHITECTURE.md) — model and invariants
- [`docs/TOURNAMENT_DAY_PLAYBOOK.md`](docs/TOURNAMENT_DAY_PLAYBOOK.md) — intended organizer workflows

## Local setup

Requirements: Node.js 20+ (22 recommended), npm, and PostgreSQL.

```bash
cp .env.example .env
npm ci
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

Do not use `prisma db push` for an existing environment. See [docs/MIGRATIONS.md](docs/MIGRATIONS.md).

## Local seed credentials

Development-only credentials created by `npm run db:seed`:

- Admin: `admin@mpw.test` / `admin123`
- Open Division team leaders: `leader1@mpw.test` through `leader12@mpw.test` / `leader123`

Change/remove seeded credentials before a real event.

## Verification

```bash
npx prisma format
npx prisma validate
npx prisma generate
npm run typecheck
npm test
npm run build
```

`npm run verify` runs the same chain. If dependencies cannot be installed in a recovery environment, at minimum run the repository syntax pass and then rerun the full chain on the deployment machine before production.

## Existing operations docs

- [Recovery report](docs/RECOVERY_REPORT.md)
- [Migration procedure](docs/MIGRATIONS.md)
- [Tournament operations](docs/OPERATIONS.md)
- [MVP formula](docs/MVP_FORMULA.md)
- [Temporary AWS EC2 deployment](docs/DEPLOYMENT_EC2.md)
- [Validation results](docs/VALIDATION_RESULTS.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
