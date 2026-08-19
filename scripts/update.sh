#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────
# Hydro Analytics — Update & Rebuild
# Pull latest code from Git and rebuild container images
# ──────────────────────────────────────────────────────────────────

DEPLOY_DIR="/opt/hydroanalytics"

echo "═══════════════════════════════════════════════════════════"
echo "  Hydro Analytics — Update & Rebuild"
echo "═══════════════════════════════════════════════════════════"

# 1. Pull latest code
echo ""
echo "[1/4] Pulling latest code..."
cd "$DEPLOY_DIR/app"
sudo git pull

# 2. Re-run port detection
echo ""
echo "[2/4] Re-checking port availability..."
if [ -f "$DEPLOY_DIR/scripts/find_free_ports.sh" ]; then
    bash "$DEPLOY_DIR/scripts/find_free_ports.sh"
fi

# 3. Rebuild images (optional)
echo ""
echo "[3/4] Checking container images..."
cd "$DEPLOY_DIR/app"

if [ "${1:-}" = "--build" ]; then
    echo "  --build flag detected. Rebuilding container images..."
    sudo podman build -f docker/Dockerfile.python -t localhost/hydro-python:latest .
    sudo podman build -f docker/Dockerfile.whatsapp -t localhost/hydro-whatsapp:latest .
    sudo podman build -f docker/Dockerfile.frontend -t localhost/hydro-frontend:latest .
else
    echo "  Live code is mounted directly from disk. Skipping image rebuild."
    echo "  (To force a full image rebuild, run: bash scripts/update.sh --build)"
fi

# 4. Restart pod
echo ""
echo "[4/4] Restarting pod with updated images..."

# Source .env.ports
if [ -f "$DEPLOY_DIR/.env.ports" ]; then
    set -a
    source "$DEPLOY_DIR/.env.ports"
    set +a
fi

sudo podman-compose -f docker/podman-compose.yml down
sudo -E podman-compose -f docker/podman-compose.yml up -d

echo ""
echo "✅ Update complete! All containers restarted."
echo ""
sudo podman ps --format "table {{.Names}} {{.Status}} {{.Ports}}"
