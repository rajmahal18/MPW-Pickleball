# Validation Results

Validation date: 2026-07-29

## Passed

### TypeScript/TSX syntax parse

A dependency-independent pass used the available TypeScript 5.8 compiler API to parse/transpile every `.ts` and `.tsx` file under `app`, `components`, `lib`, `prisma`, and `tests`.

```text
67 files checked
0 syntax diagnostics
```

### Focused domain tests

Because the repository's `tsx` package could not be installed in this environment, the same test source and dependent pure modules were transpiled with TypeScript and executed using `node --test`.

```text
6 tests
6 passed
0 failed
```

Covered:

- standings and tiebreak order;
- best second-place wildcard;
- cross-group wildcard ordering that deliberately ignores unrelated head-to-head data;
- separate Male/Female MVP rankings and locked-pair disclosure;
- deterministic simulation seed;
- voting-code normalization and a fixed QR matrix regression fingerprint.

### QR decode verification

The generated Version 1-L voting-code matrix was rendered to an image and decoded using OpenCV's `QRCodeDetector`.

```text
Input:   ABCDE23456
Decoded: ABCDE23456
Detected: true
```

### Repository checks

```text
git diff --check: passed
package.json parse: passed
package-lock.json parse: passed
scripts/backup.sh bash syntax: passed
67 TypeScript/TSX files checked for internal imports: all resolved
Prisma structural review: 17 models, 8 enums, 0 duplicate/missing relation or index fields
```

## Blocked by package registry

`npm ci --ignore-scripts --no-audit --no-fund` could not install dependencies because the execution environment's internal npm mirror returned HTTP 404 for a transitive package:

```text
npm error code E404
npm error 404 Not Found - GET .../util-deprecate/-/util-deprecate-1.0.2.tgz
```

The unused direct `zod` dependency was removed, after which installation progressed to the transitive mirror failure above. The public npm registry was also not DNS-resolvable from this container.

Consequently, these authoritative framework/database checks remain to be run on a machine with npm access:

```bash
npm ci
npx prisma format
npx prisma validate
npx prisma generate
npm run typecheck
npm test
npm run build
```

No claim of a successful Next.js production build or Prisma validation is made in this package.
