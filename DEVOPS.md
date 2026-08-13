# DEVOPS.md — MPW Pickleball Tournament

This file is the production deployment/operations guide for Codex.

## Production architecture

The MPW Pickleball Tournament shares one DigitalOcean Droplet with the existing Al-Amanah Coop Laravel app.

**Droplet**
- Hostname: `Al-Amanah-Coop`
- Public IP: `134.209.101.68`
- Ubuntu 24.04
- 2 vCPU / 4 GB RAM
- ~116 GB disk
- 2 GB swap
- SSH user: `deploy`

**Important:** Do not modify, replace, stop, or restructure the existing Al-Amanah application unless explicitly requested.

### Existing Al-Amanah app
- Path: `/var/www/al-amanah-coop`
- Stack: Laravel / PHP-FPM
- Nginx site: `/etc/nginx/sites-available/al-amanah`
- Existing public access is currently via the Droplet IP.

### MPW Tournament app
- Repo: `https://github.com/rajmahal18/MPW-Pickleball.git`
- Path: `/var/www/mpw-tournament`
- Stack: Next.js + Prisma + PostgreSQL/Neon
- Internal bind: `127.0.0.1:3001`
- systemd service: `mpw-tournament`
- Public URL: `https://mpwdinkanddash.cotabatopickleball.com`
- Health endpoint: `https://mpwdinkanddash.cotabatopickleball.com/api/health`
- Nginx site: `/etc/nginx/sites-available/mpw-tournament`
- TLS: Let's Encrypt / Certbot
- Certbot auto-renewal is enabled.

## Production environment

Production secrets live only on the server:

`/var/www/mpw-tournament/.env.production`

Required keys:

```env
DATABASE_URL=
SESSION_SECRET=
VOTING_CODE_PEPPER=
VOTE_ATTEMPT_SALT=
NEXT_PUBLIC_APP_NAME=
AVATAR_STORAGE_DIR=/var/lib/rverse-pickleball/avatars
ALLOW_FACTORY_RESET=false
```

`.env.production` is intentionally excluded locally through `.git/info/exclude`.

Never commit production secrets to Git.

Avatar storage:

`/var/lib/rverse-pickleball/avatars`

Owned by `deploy:deploy`.

## Quick deployment

Use this for ordinary app releases. Keep deployments short, sequential, and easy to verify.

Local machine:

```bash
git status --short
git add .
git commit -m "Describe the change"
git push
```

Production server:

```bash
ssh alamanah
cd /var/www/mpw-tournament
git status --short
```

If there are unexpected local changes, **stop**. Do not overwrite them or run a blind pull.

```bash
git pull --ff-only
npm ci
npx prisma migrate status
npm run build
```

Only when `migrate status` shows an expected pending migration:

```bash
npx prisma migrate deploy
```

Restart only after the build succeeds and any required migration has been applied:

```bash
sudo systemctl restart mpw-tournament
```

Verify:

```bash
sudo systemctl status mpw-tournament --no-pager
curl https://mpwdinkanddash.cotabatopickleball.com/api/health
```

Expected health result:

```json
{"ok":true,"database":"ok",...}
```

That is the normal production deployment. Do not add CI/CD, Docker, new process managers, or extra orchestration unless genuinely required.

## Quick server commands

Restart:

```bash
sudo systemctl restart mpw-tournament
```

Logs:

```bash
sudo journalctl -u mpw-tournament -n 100 --no-pager
```

## Database migrations

Do **not** run migrations automatically on every deployment.

Only run a migration when the release actually contains a new Prisma migration and the schema change is intended for production.

Before migration:

```bash
cd /var/www/mpw-tournament
set -a
source .env.production
set +a
npx prisma migrate status
```

If a real pending production migration is expected:

```bash
npx prisma migrate deploy
```

Never use `npx prisma migrate dev` in production.

Never reset or reseed the production database unless explicitly requested.

## Nginx

MPW Tournament is reverse proxied to:

`http://127.0.0.1:3001`

Before any Nginx reload:

```bash
sudo nginx -t
```

Only if validation succeeds:

```bash
sudo systemctl reload nginx
```

Do not edit the Al-Amanah Nginx site when working on MPW Tournament unless explicitly requested.

## systemd

Useful commands:

```bash
sudo systemctl status mpw-tournament --no-pager
sudo systemctl restart mpw-tournament
sudo journalctl -u mpw-tournament -n 100 --no-pager
```

The service is enabled at boot.

## TLS / HTTPS

The MPW subdomain is already configured with Let's Encrypt.

Certificate hostname:

`mpwdinkanddash.cotabatopickleball.com`

Certbot renewal runs automatically. Do not manually replace certificates unless renewal is failing.

## Rollback

Before a risky release, record the current commit:

```bash
git rev-parse HEAD
```

If a new release fails after deployment, return to the previously known-good commit:

```bash
git checkout <known-good-commit>
npm ci
npm run build
sudo systemctl restart mpw-tournament
curl https://mpwdinkanddash.cotabatopickleball.com/api/health
```

If the failed release included a database migration, do **not** attempt an improvised database rollback. Report the migration state first.

## Codex deployment rules

1. Prefer short, human-safe commands over large shell scripts.
2. Give commands in small sequential checkpoints.
3. Never assume a migration exists.
4. Never use `npm audit fix --force` as part of deployment.
5. Do not upgrade Node, Next.js, Prisma, npm, Ubuntu packages, Nginx, or PHP during an ordinary app deployment.
6. Do not touch `/var/www/al-amanah-coop` while deploying MPW Tournament.
7. Do not delete or overwrite `.env.production`.
8. Do not expose production secrets in output.
9. Build successfully before restarting the running app.
10. Stop on errors instead of continuing through a broken deployment.
11. Verify the public `/api/health` endpoint after every production restart.
12. Keep deployment instructions concise. Avoid unnecessary DevOps complexity.

## Current known-good checks

```bash
systemctl is-enabled mpw-tournament
# enabled
```

```bash
curl https://mpwdinkanddash.cotabatopickleball.com/api/health
# {"ok":true,"database":"ok",...}
```

Al-Amanah should also remain reachable after MPW changes.

---

If an app release does not require infrastructure changes, Codex should not modify Nginx, systemd, DNS, TLS, firewall, PHP-FPM, or the Al-Amanah application.
