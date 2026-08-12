#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# WhatsApp Bot Cron Runner
# Triggered by host crontab at 8:55 AM and 8:55 PM (Asia/Karachi)
# Bot runs for up to 3 hours (listenWindowMinutes: 180) then exits
# ──────────────────────────────────────────────────────────────────

CONTAINER_NAME="hydro-whatsapp-run-$(date +%Y%m%d-%H%M)"
LOG_DIR="/opt/hydroanalytics/logs/whatsapp"
mkdir -p "$LOG_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting WhatsApp bot: $CONTAINER_NAME" \
    >> "$LOG_DIR/cron.log"

podman run --rm \
    --name "$CONTAINER_NAME" \
    --network host \
    -v /opt/hydroanalytics/data:/app/data \
    -v /opt/hydroanalytics/res_storages:/app/res_storages \
    -v /opt/hydroanalytics/res_kp:/app/res_kp \
    -v /opt/hydroanalytics/script:/app/script \
    -v /opt/hydroanalytics/wwebjs_auth:/app/whatsapp_bot/.wwebjs_auth \
    -v /opt/hydroanalytics/git_config/.gitconfig:/root/.gitconfig:ro \
    -v /opt/hydroanalytics/git_config/.ssh:/root/.ssh:ro \
    -e TZ=Asia/Karachi \
    -e PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    -e GIT_SSH_COMMAND='ssh -i /root/.ssh/id_rsa -o StrictHostKeyChecking=no' \
    --shm-size=512m \
    localhost/hydro-whatsapp:latest \
    node bot.js \
    >> "$LOG_DIR/$CONTAINER_NAME.log" 2>&1

EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot exited (code $EXIT_CODE): $CONTAINER_NAME" \
    >> "$LOG_DIR/cron.log"
