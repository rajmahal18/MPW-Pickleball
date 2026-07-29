#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/rverse-pickleball}"
AVATAR_STORAGE_DIR="${AVATAR_STORAGE_DIR:-/var/lib/rverse-pickleball/avatars}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump --format=custom --no-owner --file="$BACKUP_DIR/database-$STAMP.dump" "$DATABASE_URL"
if [ -d "$AVATAR_STORAGE_DIR" ]; then tar -czf "$BACKUP_DIR/avatars-$STAMP.tar.gz" -C "$AVATAR_STORAGE_DIR" .; fi
find "$BACKUP_DIR" -type f -mtime +7 -delete
