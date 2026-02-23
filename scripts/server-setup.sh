#!/usr/bin/env bash
set -euo pipefail

echo "=== Rescue Info — Server Setup ==="

# 1. Install Docker (if not installed via marketplace image)
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# 2. Install Docker Compose plugin (if not installed)
if ! docker compose version &>/dev/null; then
  echo "Installing Docker Compose plugin..."
  apt-get update && apt-get install -y docker-compose-plugin
fi

# 3. Create deploy user
if ! id deploy &>/dev/null; then
  echo "Creating deploy user..."
  adduser --disabled-password --gecos "" deploy
  usermod -aG docker deploy
  mkdir -p /home/deploy/.ssh
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys
  echo "deploy ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/deploy
fi

# 4. Configure UFW
echo "Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 5. Create shared Docker network
docker network create web 2>/dev/null || echo "Network 'web' already exists"

# 6. Set up Traefik
echo "Setting up Traefik..."
mkdir -p /opt/traefik
cat > /opt/traefik/.env <<'ENVEOF'
ACME_EMAIL=admin@example.com
ENVEOF

echo "Copy scripts/traefik/docker-compose.yml to /opt/traefik/ then run:"
echo "  cd /opt/traefik && docker compose up -d"

# 7. Set up Rescue Info app directory
echo "Setting up Rescue Info..."
mkdir -p /opt/rescue-info

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit /opt/traefik/.env with your ACME_EMAIL"
echo "  2. Copy traefik docker-compose.yml to /opt/traefik/"
echo "  3. cd /opt/traefik && docker compose up -d"
echo "  4. Clone repo to /opt/rescue-info/"
echo "  5. Create /opt/rescue-info/.env with DOMAIN and ADMIN_PASSWORD"
echo "  6. cd /opt/rescue-info && docker compose up -d --build"
echo "  7. Add GitHub Actions deploy key to repo secrets"
