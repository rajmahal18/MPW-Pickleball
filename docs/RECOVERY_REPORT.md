# Recovery Report

## Detected stack

- Next.js 15.4.2 App Router
- React 19.1
- TypeScript 5.8
- Tailwind CSS 3.4
- Prisma 6.12 with PostgreSQL
- JWT session cookie authentication using `jose`; password hashes using `bcryptjs`
- npm package manager
- Short polling for the public live experience

## Repository condition at intake

The uploaded ZIP was extracted into a new working directory and inspected before modification. It did not contain a `.git` directory and did not contain a Prisma migration history. A local Git repository was initialized only to establish an immutable uploaded-source baseline before continuing development.

Baseline commit created during recovery:

```text
ded0e39 Baseline from uploaded source archive
```

No destructive database command was run.

## Existing features found

The uploaded source already contained:

- public tournament home, teams, players, groups, matchups, and bracket pages;
- admin and team-leader authentication;
- 3 groups × 4 teams seed data;
- 7 pairs and 14 players per team;
- group schedule generation;
- team-leader lineup submission;
- seven pair games generated after both lineups exist;
- basic live scoring and public polling;
- group standings and a basic knockout generator.

## Partial or conflicting work found

- No Git history was available to distinguish earlier partial attempts.
- No Prisma migrations existed; setup used `prisma db push`.
- Standings and bracket logic were spread across pages/routes and were not consistently recalculated after a score correction.
- Scoring had no mutation history, concurrency version, transactional undo, or audit trail.
- Knockout assignments could become stale after group-stage changes.
- There was no Fan Favorite code lifecycle, Simulation Center, checkpoints, scoped reset center, avatar storage strategy, or statistical MVP tracker.
- The original README explicitly listed rate limiting, audit logs, and score correction history as future work.

## Prisma/schema recovery

The original schema was preserved as a baseline migration. New functionality is supplied by a separate additive migration. The feature migration adds enums, columns, indexes, constraints, and new tables rather than silently recreating the database.

See `docs/MIGRATIONS.md` before applying this to an existing prototype database.

## Implemented recovery plan

1. Centralized standings, wildcard, bracket, MVP, voting, snapshot, and simulation logic.
2. Added additive Prisma models and reviewed SQL migrations.
3. Added versioned, auditable, reversible scoring.
4. Added secure one-time voting codes and live Fan Favorite rankings.
5. Added deterministic simulations against real tables and services.
6. Added checkpoints, scoped undo, and reset controls.
7. Added player avatars with EC2-safe persistent storage configuration.
8. Added server-side authorization checks for sensitive routes.
9. Added operational documentation and a separate EC2 deployment plan.
10. Added focused domain tests and verification scripts.
