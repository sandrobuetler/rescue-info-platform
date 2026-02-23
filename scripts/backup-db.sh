#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DATABASE_PATH:-/app/data/rescue-info.db}"
BACKUP_DIR="/app/data/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/rescue-info_$TIMESTAMP.db'"

# Keep only last 4 backups
ls -t "$BACKUP_DIR"/rescue-info_*.db | tail -n +5 | xargs -r rm

echo "Backup complete: rescue-info_$TIMESTAMP.db"
