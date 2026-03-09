#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# VPS Initial Setup Script for Epic Fulfill Shopify App
# Run this ONCE on your VPS to set up the deployment environment
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

DOMAIN="fulfill.epicnexusgroup.com"
APP_DIR="/opt/epicfulfill"
REPO="your-github-username/EpicWebService"   # ← CHANGE THIS

echo "═══════════════════════════════════════════"
echo "  Epic Fulfill - VPS Setup"
echo "  Domain: ${DOMAIN}"
echo "═══════════════════════════════════════════"

# ── 1. Install Docker if not present ─────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# ── 2. Install Docker Compose plugin if not present ──────────────
if ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose plugin..."
    apt-get update && apt-get install -y docker-compose-plugin
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose already installed"
fi

# ── 3. Create application directory ─────────────────────────────
echo "📁 Setting up ${APP_DIR}..."
mkdir -p "${APP_DIR}/nginx/conf.d"

# ── 4. Copy config files ────────────────────────────────────────
# (These should already be in the repo; this copies them into place)
echo "⚠️  Make sure the following files exist in ${APP_DIR}:"
echo "    - docker-compose.yml"
echo "    - nginx/nginx.conf"
echo "    - .env"
echo ""
echo "You can clone your repo or scp them:"
echo "  git clone https://github.com/${REPO}.git /tmp/epicfulfill-src"
echo "  cp /tmp/epicfulfill-src/docker-compose.yml ${APP_DIR}/"
echo "  cp -r /tmp/epicfulfill-src/nginx ${APP_DIR}/"
echo ""

# ── 5. Create .env file template ────────────────────────────────
if [ ! -f "${APP_DIR}/.env" ]; then
    cat > "${APP_DIR}/.env" <<'ENVFILE'
# ═══════════════════════════════════════════
# Epic Fulfill - Environment Variables
# ═══════════════════════════════════════════

# Shopify App Credentials
SHOPIFY_API_KEY=aeeb5a0125694f9a00b74968e3d69b66
SHOPIFY_API_SECRET=your_shopify_api_secret_here

# App Config
HOST=https://fulfill.epicnexusgroup.com
PORT=8081
NODE_ENV=production
SCOPES=read_customers,read_orders,read_products,write_assigned_fulfillment_orders,write_customers,write_fulfillments,write_merchant_managed_fulfillment_orders,write_orders,write_products,write_third_party_fulfillment_orders,read_locations

# GitHub Container Registry (for docker-compose image reference)
GITHUB_REPOSITORY=your-github-username/EpicWebService
ENVFILE
    echo "✅ Created ${APP_DIR}/.env — EDIT IT with your real secrets!"
else
    echo "✅ .env already exists"
fi

# ── 6. Obtain SSL certificate ───────────────────────────────────
echo ""
echo "🔐 Setting up SSL certificate for ${DOMAIN}..."
echo ""

# First, start nginx without SSL to handle ACME challenge
# Create a temporary nginx config for initial cert acquisition
mkdir -p "${APP_DIR}/nginx-init"
cat > "${APP_DIR}/nginx-init/nginx.conf" <<'NGINXCONF'
events { worker_connections 1024; }
http {
    server {
        listen 80;
        server_name fulfill.epicnexusgroup.com;
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        location / {
            return 200 'Setting up SSL...';
            add_header Content-Type text/plain;
        }
    }
}
NGINXCONF

echo "Starting temporary nginx for SSL verification..."
docker run -d --name nginx-certbot-init \
    -p 80:80 \
    -v "${APP_DIR}/nginx-init/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v epicfulfill_certbot_webroot:/var/www/certbot \
    nginx:alpine

echo "Requesting SSL certificate..."
docker run --rm \
    -v epicfulfill_certbot_etc:/etc/letsencrypt \
    -v epicfulfill_certbot_var:/var/lib/letsencrypt \
    -v epicfulfill_certbot_webroot:/var/www/certbot \
    certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    --email admin@epicnexusgroup.com \
    --agree-tos --no-eff-email \
    -d "${DOMAIN}"

# Stop and remove temp nginx
docker stop nginx-certbot-init && docker rm nginx-certbot-init
rm -rf "${APP_DIR}/nginx-init"

echo "✅ SSL certificate obtained!"

# ── 7. Login to GHCR ────────────────────────────────────────────
echo ""
echo "🔑 Login to GitHub Container Registry:"
echo "   docker login ghcr.io -u YOUR_GITHUB_USERNAME"
echo ""

# ── 8. Start the application ────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Setup complete! To start the app:"
echo ""
echo "  cd ${APP_DIR}"
echo "  # Edit .env with your real secrets"
echo "  # Make sure docker-compose.yml and nginx/ are in place"
echo "  docker compose up -d"
echo ""
echo "  Your app will be live at:"
echo "  https://${DOMAIN}"
echo "═══════════════════════════════════════════"
