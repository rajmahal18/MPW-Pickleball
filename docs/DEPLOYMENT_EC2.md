# Temporary AWS EC2 Deployment

This application must run separately from the existing Document Tracker. Use a different EC2 instance, database/schema, system user, application directory, PM2 process, Nginx server block, backup directory, and domain/subdomain.

No AWS resource is created by this repository.

## Suggested architecture

- Ubuntu LTS EC2 instance
- Node.js 22 LTS
- Nginx reverse proxy
- PM2 single-process application on port 3100
- PostgreSQL on RDS or another separately backed-up PostgreSQL host
- HTTPS using Certbot
- persistent avatar directory at `/var/lib/mpw-pickleball/avatars`
- daily `pg_dump` and avatar archive

The in-memory public vote limiter assumes one application process. Keep PM2 at one instance unless the limiter is replaced with Redis or another shared store.

## Server preparation

```bash
sudo apt update
sudo apt install -y nginx postgresql-client certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

sudo adduser --system --group --home /var/www/mpw-pickleball mpw-pickleball
sudo mkdir -p /var/www/mpw-pickleball/current /var/lib/mpw-pickleball/avatars /var/backups/mpw-pickleball
sudo chown -R mpw-pickleball:mpw-pickleball /var/www/mpw-pickleball /var/lib/mpw-pickleball /var/backups/mpw-pickleball
```

## Deploy application

Copy the repository to `/var/www/mpw-pickleball/current`, then:

```bash
cd /var/www/mpw-pickleball/current
sudo -u mpw-pickleball npm ci
sudo -u mpw-pickleball cp .env.example .env
sudo -u mpw-pickleball nano .env
sudo -u mpw-pickleball npx prisma migrate deploy
sudo -u mpw-pickleball npm run build
sudo -u mpw-pickleball pm2 start ecosystem.config.cjs
sudo -u mpw-pickleball pm2 save
```

Use high-entropy, separate values for `SESSION_SECRET`, `VOTING_CODE_PEPPER`, and `VOTE_ATTEMPT_SALT`. Keep `ALLOW_FACTORY_RESET=false` in production.

## Nginx and HTTPS

Copy `deploy/nginx.conf.example` to a separate site file, edit the domain, and enable it:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/mpw-pickleball
sudo ln -s /etc/nginx/sites-available/mpw-pickleball /etc/nginx/sites-enabled/mpw-pickleball
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d tournament.example.com
```

Do not modify the Document Tracker Nginx upstream or PM2 process.

## Backups

Install `scripts/backup.sh` for the application user and run it daily with cron. It retains seven days by default.

```bash
sudo install -o mpw-pickleball -g mpw-pickleball -m 750 scripts/backup.sh /usr/local/bin/mpw-pickleball-backup
sudo -u mpw-pickleball crontab -e
```

Example cron:

```cron
15 2 * * * . /var/www/mpw-pickleball/current/.env && /usr/local/bin/mpw-pickleball-backup >> /var/log/mpw-pickleball-backup.log 2>&1
```

Test restoration before the event:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /var/backups/mpw-pickleball/database-TIMESTAMP.dump
```

Restore the matching avatar archive into `AVATAR_STORAGE_DIR`.

## Release procedure

1. Create a database backup.
2. Put the app into a maintenance window if schema changes are included.
3. Pull/copy the new release.
4. Run `npm ci`.
5. Run `npx prisma migrate deploy`.
6. Run `npm run build`.
7. Run `pm2 reload mpw-pickleball --update-env`.
8. Verify login, one public page, one scoring page, Fan Favorite ranking, and avatar delivery.
9. Keep the prior release directory for quick application rollback; restore the database backup when schema/data rollback is required.
