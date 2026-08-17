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

# ── Pre-flight: ensure clean git tree before bot runs ──
APP_DIR="/opt/hydroanalytics/app"
GIT_SSH="ssh -i /opt/hydroanalytics/git_config/.ssh/id_rsa -o StrictHostKeyChecking=no"

# 1. Remove LFS hooks that block container push (they get recreated by git pull)
rm -f "$APP_DIR/.git/hooks/pre-push" "$APP_DIR/.git/hooks/post-commit"

# 2. Abort any stuck rebase/merge state from previous failed runs
cd "$APP_DIR"
git rebase --abort 2>/dev/null || true
git merge --abort 2>/dev/null || true

# 3. Push any unpushed commits from previous failed runs
GIT_SSH_COMMAND="$GIT_SSH" git push 2>/dev/null || true

# 4. Sync runtime databases into git working tree so git add picks them up
cp -f /opt/hydroanalytics/data/daily_water_situation.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/kp_stations_data.sqlite "$APP_DIR/data/" 2>/dev/null || true
cd - >/dev/null

# ── Backup: snapshot databases and PDFs before bot runs (7-day rolling) ──
BACKUP_DIR="/opt/hydroanalytics/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"
cp -f /opt/hydroanalytics/data/daily_water_situation.sqlite "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/kp_stations_data.sqlite "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_storages/Daily\ Water\ Situation.pdf "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_kp/Flood\ Report.pdf "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/script/ft_and_percentage.js "$BACKUP_DIR/" 2>/dev/null || true
# Clean backups older than 7 days
find /opt/hydroanalytics/backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup saved to $BACKUP_DIR" >> "$LOG_DIR/cron.log"

podman run --rm \
    --name "$CONTAINER_NAME" \
    --network host \
    -v /opt/hydroanalytics/data:/app/data \
    -v /opt/hydroanalytics/res_storages:/app/res_storages \
    -v /opt/hydroanalytics/res_kp:/app/res_kp \
    -v /opt/hydroanalytics/script:/app/script \
    -v /opt/hydroanalytics/wwebjs_auth:/app/whatsapp_bot/.wwebjs_auth \
    -v /opt/hydroanalytics/app/.git:/app/.git \
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
