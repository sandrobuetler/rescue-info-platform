#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:?Usage: deploy-full.sh <domain> <acme_email> <admin_password>}"
ACME_EMAIL="${2:?Usage: deploy-full.sh <domain> <acme_email> <admin_password>}"
ADMIN_PASSWORD="${3:?Usage: deploy-full.sh <domain> <acme_email> <admin_password>}"

echo "=== Rescue Info — Full Deploy ==="
echo "Domain:   $DOMAIN"
echo "Email:    $ACME_EMAIL"
echo ""

# 1. Traefik
echo ">>> Setting up Traefik..."
mkdir -p /opt/traefik
cd /opt/traefik
echo "ACME_EMAIL=$ACME_EMAIL" > .env
curl -fsSL https://raw.githubusercontent.com/sandrobuetler/rescue-info-platform/main/scripts/traefik/docker-compose.yml -o docker-compose.yml
docker compose up -d
echo ">>> Traefik running."

# 2. App
echo ">>> Cloning and deploying app..."
mkdir -p /opt/rescue-info
cd /opt/rescue-info
if [ -d .git ]; then
  git pull origin main
else
  git clone https://github.com/sandrobuetler/rescue-info-platform.git .
fi

printf 'DOMAIN=%s\nADMIN_PASSWORD=%s\nDATABASE_PATH=/app/data/rescue-info.db\n' "$DOMAIN" "$ADMIN_PASSWORD" > .env

docker compose up -d --build
echo ">>> App containers running."

# 3. Database
echo ">>> Initializing database..."
sleep 5  # wait for container to be ready
docker compose exec web npx tsx scripts/init-db.ts
echo ">>> Running scraper (this may take a minute)..."
docker compose exec web npx tsx scripts/scraper/index.ts

echo ""
echo "=== Deploy complete ==="
echo "Visit: https://$DOMAIN"
echo "Admin: https://$DOMAIN/admin/review"
