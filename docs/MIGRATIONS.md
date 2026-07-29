# Prisma Migration Procedure

## Migration files

- `20260729090000_baseline`: records the schema that existed in the uploaded ZIP.
- `20260729100000_live_platform_features`: additive live-platform upgrade.

Review both SQL files before applying them.

The original schema did not store player sex. The additive migration infers the uploaded prototype's existing mixed-pair convention (`playerA` → Male, `playerB` → Female) so the column can become required without dropping rows. **Verify and correct those inferred values before using real-event MVP rankings.** Fresh seed data writes the category explicitly.

## Fresh database

```bash
npm ci
cp .env.example .env
npx prisma migrate deploy
npm run db:seed
```

## Existing database created by the original `prisma db push` workflow

Do not blindly run the feature migration. First:

1. Stop writes to the application.
2. Create a PostgreSQL backup.
3. Confirm the database structure matches the baseline schema.
4. Inspect whether `_prisma_migrations` already exists.
5. Generate and review a schema diff before marking anything applied.

Typical commands:

```bash
pg_dump --format=custom --no-owner --file=pre-upgrade.dump "$DATABASE_URL"

npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > reviewed-upgrade-diff.sql
```

When the live database matches the original uploaded schema and has no migration history, baseline it without executing the baseline SQL:

```bash
npx prisma migrate resolve --applied 20260729090000_baseline
npx prisma migrate deploy
```

Then verify:

```bash
npx prisma migrate status
npx prisma validate
npx prisma generate
npm run typecheck
npm test
npm run build
```

Never mark the baseline as applied unless the database was inspected and confirmed to match it.

## Rollback approach

Prisma does not automatically reverse a production migration. Restore the pre-upgrade PostgreSQL dump if the upgrade must be rolled back. Application checkpoints are for tournament activity and voting data; they are not substitutes for database backups or schema rollback.
