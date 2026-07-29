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
- persistent avatar directory at `/var/lib/rverse-pickleball/avatars`
- daily `pg_dump` and avatar archive

The in-memory public vote limiter assumes one application process. Keep PM2 at one instance unless the limiter is replaced with Redis or another shared store.

## Server preparation

```bash
sudo apt update
sudo apt install -y nginx postgresql-client certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

sudo adduser --system --group --home /var/www/rverse-pickleball rverse-pickleball
sudo mkdir -p /var/www/rverse-pickleball/current /var/lib/rverse-pickleball/avatars /var/backups/rverse-pickleball
sudo chown -R rverse-pickleball:rverse-pickleball /var/www/rverse-pickleball /var/lib/rverse-pickleball /var/backups/rverse-pickleball
```

## Deploy application

Copy the repository to `/var/www/rverse-pickleball/current`, then:

```bash
cd /var/www/rverse-pickleball/current
sudo -u rverse-pickleball npm ci
sudo -u rverse-pickleball cp .env.example .env
sudo -u rverse-pickleball nano .env
sudo -u rverse-pickleball npx prisma migrate deploy
sudo -u rverse-pickleball npm run build
sudo -u rverse-pickleball pm2 start ecosystem.config.cjs
sudo -u rverse-pickleball pm2 save
```

Use high-entropy, separate values for `SESSION_SECRET`, `VOTING_CODE_PEPPER`, and `VOTE_ATTEMPT_SALT`. Keep `ALLOW_FACTORY_RESET=false` in production.

## Nginx and HTTPS

Copy `deploy/nginx.conf.example` to a separate site file, edit the domain, and enable it:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/rverse-pickleball
sudo ln -s /etc/nginx/sites-available/rverse-pickleball /etc/nginx/sites-enabled/rverse-pickleball
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d tournament.example.com
```

Do not modify the Document Tracker Nginx upstream or PM2 process.

## Backups

Install `scripts/backup.sh` for the application user and run it daily with cron. It retains seven days by default.

```bash
sudo install -o rverse-pickleball -g rverse-pickleball -m 750 scripts/backup.sh /usr/local/bin/rverse-pickleball-backup
sudo -u rverse-pickleball crontab -e
```

Example cron:

```cron
15 2 * * * . /var/www/rverse-pickleball/current/.env && /usr/local/bin/rverse-pickleball-backup >> /var/log/rverse-pickleball-backup.log 2>&1
```

Test restoration before the event:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /var/backups/rverse-pickleball/database-TIMESTAMP.dump
```

Restore the matching avatar archive into `AVATAR_STORAGE_DIR`.

## Release procedure

1. Create a database backup.
2. Put the app into a maintenance window if schema changes are included.
3. Pull/copy the new release.
4. Run `npm ci`.
5. Run `npx prisma migrate deploy`.
6. Run `npm run build`.
7. Run `pm2 reload rverse-pickleball --update-env`.
8. Verify login, one public page, one scoring page, Fan Favorite ranking, and avatar delivery.
9. Keep the prior release directory for quick application rollback; restore the database backup when schema/data rollback is required.
