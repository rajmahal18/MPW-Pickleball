# RVerse Team Pickleball Championship MVP

A public-facing, Liquipedia-inspired tournament hub with team-leader lineup submission and admin-operated live scoring.

## Included

- 3 groups × 4 teams
- 7 registered pairs / 14 players per team
- 84 pairs and 168 seeded players
- Round-robin group fixtures: 6 team matchups per group, 18 overall
- Seven games per team matchup after both lineups are submitted
- Server-side prevention of repeated pairs in one matchup
- Public teams, players, groups, standings, match pages and knockout bracket
- Admin live scoring with 2-second public polling
- Group winners + best runner-up wildcard bracket generation
- Team leaders may also be linked to a player record
- Vercel Singapore region configuration

## Setup

1. Create a Neon PostgreSQL database.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `SESSION_SECRET`.
3. Install and initialize:

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## Seed accounts

- Admin: `admin@rverse.test` / `admin123`
- Team 1 leader: `leader1@rverse.test` / `leader123`
- Other leaders: `leader2@rverse.test` through `leader12@rverse.test`, same password

## Vercel deployment

Set `DATABASE_URL` and `SESSION_SECRET` in Vercel. The included `vercel.json` pins functions to Singapore.

## MVP notes

- Live updates use polling, which is simple and reliable on Vercel.
- Scoring is rule-agnostic: the admin decides when to finalize a non-tied game.
- Knockout teams are generated from points, game differential, then game wins.
- For production, add audit logs, password reset, rate limiting, score correction history, scheduling, and a formal tiebreak policy.
