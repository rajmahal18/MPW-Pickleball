# Known Limitations and Remaining Verification

## Environment-blocked verification

The recovery environment could not resolve or reach either the public npm registry or its configured package mirror. `node_modules` was not present in the uploaded ZIP. Therefore these commands could not be completed here:

- `npx prisma format`
- `npx prisma validate`
- `npx prisma generate`
- full TypeScript framework type-check
- domain test execution through the repository's `tsx` runner
- Next.js production build

A dependency-independent TypeScript compiler syntax pass was run across all `.ts` and `.tsx` files and returned zero syntax diagnostics. The six focused domain tests were also transpiled with the available TypeScript compiler and all passed under Node's test runner. The migration SQL and schema were manually reviewed, but Prisma remains the authoritative validator and must be run after package installation.

## Functional scope not fully implemented

- Point-by-point timed simulation with background pause/resume/cancel is not implemented; simulations are transactional, deterministic, and instant.
- Fan Favorite rank movement over time is not shown because historical ranking snapshots are not stored.
- The in-memory rate limiter is suitable for one Node process only. Use a shared limiter before horizontally scaling.
- Checkpoint restoration intentionally restores tournament activity, score-event history, voting codes, votes, and vote-attempt history—not users, teams, players, pairs, audit logs, or uploaded avatar files.
- “Reset everything except users” preserves the current master teams, players, and pairs rather than deleting and recreating them, which avoids breaking account links.
- Full factory reset cannot retain an in-database checkpoint because it deletes the tournament and user records that own checkpoints. Take a PostgreSQL backup first.
- Existing prototype player sex values are inferred from the original `playerA`/`playerB` mixed-pair convention during migration and must be reviewed before a real event.
- The MVP model uses game results and opponent records; it cannot distinguish shot-level individual contribution within a locked pair.
- Visitor analytics uses an anonymous browser cookie for approximate uniqueness; clearing cookies or switching browsers/devices creates a new visitor identity.

Run the complete verification checklist in the README before deployment and do not treat the application as production-ready until the build, migrations, and critical workflows pass against a disposable PostgreSQL database.
