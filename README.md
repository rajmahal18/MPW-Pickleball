# RVerse Team Pickleball Championship

A public-facing, live-first pickleball tournament platform with Liquipedia-style information pages, live scoring, team-leader lineup submission, Fan Favorite voting, simulation/recovery tools, and transparent male/female MVP rankings.

## Tournament model

- 3 groups, 4 teams per group, 12 teams total
- 7 pairs / 14 players per team, 168 players total
- 6 team matchups per group; every team matchup contains 7 pair games
- Group winners plus the best second-place wildcard advance to the semifinals
- Winners of the two semifinals advance to the final
- Server-side lineup validation prevents pair or player reuse within one team matchup

## Major capabilities

- Public live hub, groups, standings, wildcard race, bracket, teams, players, and game pages
- Admin live scoring with optimistic version checks, corrections, forfeits, interruption state, audit history, and score-event undo
- Automatic recalculation of team matchup results, standings, wildcard selection, semifinal assignments, final assignments, and MVP numbers
- Team-leader-only lineup submission for the leader's assigned team
- Player avatar upload with JPEG/PNG/WebP signature checks, a 2 MB limit, and initials fallback
- One-time Fan Favorite voting codes stored as secure hashes, atomic code consumption, rejected-attempt tracking, rate limiting, printable QR cards, and live rankings
- Admin-only deterministic Simulation Center using the real tournament tables and calculation services
- Automatic and manual checkpoints; restore, simulation undo, team matchup undo, round undo, and stage undo
- Reset Data Center with multiple scopes and production restrictions
- Separate Male MVP and Female MVP leaderboards derived from completed tournament games
- Audit logs for scoring, lineups, bracket recalculation, simulation, resets, voting, checkpoints, and avatar changes

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

Do not use `prisma db push` for an existing environment. See [docs/MIGRATIONS.md](docs/MIGRATIONS.md) for the baseline procedure for databases created by the earlier prototype.

## Local seed credentials

These are development-only credentials created by `npm run db:seed`:

- Admin: `admin@rverse.test` / `admin123`
- Team leaders: `leader1@rverse.test` through `leader12@rverse.test` / `leader123`

Change or remove all seeded accounts before a real event.

## Verification

```bash
npx prisma format
npx prisma validate
npx prisma generate
npm run typecheck
npm test
npm run build
```

`npm run verify` runs the same chain. The uploaded recovery environment could not download npm dependencies because its package registry/DNS was unavailable, so framework-level build and Prisma validation must be rerun after `npm ci` on a machine with package access. Source-level TypeScript/TSX syntax validation was completed across the repository.

## Operations and deployment

- [Recovery report](docs/RECOVERY_REPORT.md)
- [Migration procedure](docs/MIGRATIONS.md)
- [Tournament operations](docs/OPERATIONS.md)
- [MVP formula](docs/MVP_FORMULA.md)
- [Temporary AWS EC2 deployment](docs/DEPLOYMENT_EC2.md)
- [Validation results](docs/VALIDATION_RESULTS.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
