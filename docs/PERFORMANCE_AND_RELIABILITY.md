# Performance and Reliability Notes

Last updated: 2026-08-10

## Objective

This application is public-facing during MPW tournament operations. The current hardening pass focuses on practical performance and reliability without changing the flexible tournament model.

The core rule remains: the system adapts to the tournament, not the other way around.

## Route Strategy

Most public routes remain dynamic because scores, standings, matchups, voting totals, and roster visibility can change during the event. Dynamic rendering is intentional for:

- `/`
- `/games`
- `/groups`
- `/groups/[slug]`
- `/matches/[id]`
- `/teams/[id]`
- `/players`
- `/bracket`
- `/mvp`
- `/fan-favorite`
- `/format`

No aggressive static caching was added for live tournament data. Correctness is more important than serving stale scores or standings.

## Pagination Strategy

Pagination is used only where data can plausibly grow large:

- `/games`: server-side page-based pagination at 60 games per page. Status filters remain URL-based. This keeps public game history from becoming one large query and DOM.
- `/players`: server-side search and pagination at 48 confirmed public players per page. Tentative pool players remain admin-only.
- `/admin/audit`: server-side pagination at 100 log records per page.

Small standing tables, matchup detail pages, and current live sections remain unpaginated because splitting them would make tournament-day UX worse.

## Loading UX

Route-level skeleton screens were added for public high-traffic routes:

- root fallback via `app/loading.tsx`
- `/games`
- `/players`
- `/groups`
- `/fan-favorite`
- `/mvp`

Skeletons reserve approximate layout space and avoid giant spinners. They intentionally do not fake delays.

## Live Refresh Strategy

The app continues to use simple short polling. WebSockets were not introduced because the current operational model does not require that extra infrastructure.

Polling protections:

- `AutoRefresh` pauses while the browser tab is hidden and refreshes on focus.
- `LiveGameCard` polls individual live games every 3 seconds only while visible.
- Fan Favorite rankings pause polling in hidden tabs and refresh on focus.
- Result-heavy pages (`/`, `/games`, `/groups`, `/groups/[slug]`, `/bracket`, `/mvp`) now poll a lightweight public matchup revision. They call `router.refresh()` only when that revision changes, so a finalized pair game propagates to standings/brackets without re-rendering the full page every few seconds when nothing changed.
- Live rally points still stay on compact JSON polling. The matchup revision is advanced by result-changing matchup recalculation, not by every +1/-1 point.

This reduces database/API pressure during tournament traffic bursts while keeping visible pages current.

## Database Query Decisions

The largest public data-volume risks were addressed through server-side pagination. Existing schema indexes already support the major access patterns:

- tournament/division/stage/order matchups
- tournament/status/schedule matchups
- matchup/game number games
- game status/start time
- player tournament/participation/activity
- fan vote tournament/player/category
- audit log tournament/date
- voting code tournament/status

No new indexes were added in this pass. Adding more indexes without measured slow queries would increase write overhead on score, vote, and audit-heavy tables.

## Mutation Reliability

The existing server-side concurrency protections remain the main source of correctness:

- score updates use game versions and transactions;
- Fan Favorite code consumption is transactional and uses serializable isolation;
- lineup submission validates ownership, active confirmed pairs, required game count, and duplicate players;
- future tournament structure edits clear stale lineups/games only before recorded play exists;
- recorded games and historical results are protected.

Additional client-side pending states were added to key forms:

- login
- voting open/close
- voting-code generation
- voting-code status actions

Client pending states are UX protection only. Correctness remains enforced on the server.

## Public Error Handling

App-level `error.tsx` and `not-found.tsx` now provide neutral public-facing failure screens. They avoid exposing raw Prisma/database details to spectators.

An `/api/health` endpoint was added for deployment checks. It performs a minimal database read and returns only health state plus timestamp.

## Image Performance

Current image usage is lightweight:

- main public visual is a local static hero background;
- avatars use the existing `PlayerAvatar` fallback behavior;
- QR codes and small icons are not routed through heavy image optimization.

Future image-heavy changes should reserve aspect ratios and avoid loading full-resolution assets for avatar thumbnails.

## Caching and Revalidation

No route cache tags were added because public pages are marked dynamic and tournament-day correctness is live-data dependent.

If future work adds static or tagged caching, mutation routes that affect scores, lineups, players, teams, divisions, votes, or visibility must explicitly invalidate the affected public paths/tags.

## Known Tradeoffs

- Homepage still computes MVP leaders from completed public games. For current tournament scale this is acceptable and avoids storing denormalized MVP state. If game volume grows substantially, introduce a materialized/stat cache invalidated by score mutations.
- Fan Favorite candidate lists are loaded into the voting client component for responsive local filtering. This is acceptable for tournament-sized confirmed player pools. If candidate counts become very large, replace with server-backed debounced search.
- `/format` remains dynamic even though some content changes less often, because public/private division state and organizer notes may change shortly before play.

## Production Validation Commands

Before production release:

```bash
npm ci
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate status
npm run typecheck
npm test
npm run build
```

After deployment:

```bash
curl -fsS https://YOUR_DOMAIN/api/health
```

Then manually verify:

- home page
- `/games`
- `/players`
- `/format`
- `/fan-favorite`
- `/mvp`
- admin login
- one score page
- one team-leader lineup page

## Admin performance hardening (2026-08-11)

The admin slowdown was primarily caused by oversized dynamic payloads rather than the `next start` runtime itself.

Changes:

- `/admin/players` now paginates at 40 records and no longer renders a complete edit form, all team options, all division options, and duplicate team/pair management UI for every player in one response.
- Full player editing moved to `/admin/players/[id]`; the pool page remains operational and batch-oriented.
- `/admin/tournament` now fetches full nested groups/teams/pairs/matchups/player entries only for the selected division instead of every division.
- `/admin/checkpoints` selects checkpoint metadata only and avoids transferring/parsing the snapshot JSON column for the listing page.
- Admin navigation has an `app/admin/loading.tsx` boundary for immediate transition feedback on dynamic routes.
- Auth lookup is memoized per server render and uses a narrow Prisma select.

These changes target both database time and React Server Component/HTML payload size, which were causing clicks to feel unresponsive even when links were technically working.
