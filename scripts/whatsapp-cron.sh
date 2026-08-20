#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# WhatsApp Bot Cron Runner
# Triggered by host crontab at 8:55 AM and 8:55 PM (Asia/Karachi)
# Bot runs for up to 3 hours (listenWindowMinutes: 180) then exits
# ──────────────────────────────────────────────────────────────────

CONTAINER_NAME="hydro-whatsapp-run-$(date +%Y%m%d-%H%M)"
LOG_DIR="/opt/hydroanalytics/logs/whatsapp"
mkdir -p "$LOG_DIR"
mkdir -p "/opt/hydroanalytics/res_gb/Historical GB Reports"
mkdir -p "/opt/hydroanalytics/data"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting WhatsApp bot: $CONTAINER_NAME" \
    >> "$LOG_DIR/cron.log"

# ── Pre-flight: ensure clean git tree before bot runs ──
APP_DIR="/opt/hydroanalytics/app"
GIT_SSH="ssh -i /opt/hydroanalytics/git_config/.ssh/id_rsa -o StrictHostKeyChecking=no"

# 1. Remove LFS hooks that block container push (they get recreated by git pull)
rm -f "$APP_DIR/.git/hooks/pre-push" "$APP_DIR/.git/hooks/post-commit"

# 2. Abort any stuck rebase/merge state and clean stale locks
rm -f "$APP_DIR/.git/AUTO_MERGE" "$APP_DIR/.git/MERGE_HEAD" "$APP_DIR/.git/REBASE_HEAD" \
      "$APP_DIR/.git/CHERRY_PICK_HEAD" "$APP_DIR/.git/index.lock" 2>/dev/null || true
cd "$APP_DIR"
git rebase --abort 2>/dev/null || true
git merge --abort 2>/dev/null || true

# 3. Discard GitHub Actions-managed files to prevent binary conflicts
git checkout -- FFD_other_gauge_fetch/latest_all_gauges.json data/other_gauges.sqlite 2>/dev/null || true

# 4. Check for stranded unpushed commits and resolve them
UNPUSHED=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l)
if [ "$UNPUSHED" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found $UNPUSHED unpushed commit(s). Resolving..." >> "$LOG_DIR/cron.log"
    GIT_SSH_COMMAND="$GIT_SSH" git pull --rebase 2>/dev/null || {
        git rebase --abort 2>/dev/null || true
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rebase failed. Resetting to origin/main..." >> "$LOG_DIR/cron.log"
        GIT_SSH_COMMAND="$GIT_SSH" git fetch origin 2>/dev/null || true
        git reset --hard origin/main 2>/dev/null || true
    }
    GIT_SSH_COMMAND="$GIT_SSH" git push 2>/dev/null || true
fi

# 5. Pull latest from upstream (rebase to avoid merge commits)
GIT_SSH_COMMAND="$GIT_SSH" git pull --rebase 2>/dev/null || {
    git rebase --abort 2>/dev/null || true
    GIT_SSH_COMMAND="$GIT_SSH" git fetch origin 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || true
}

# 6. Sync runtime databases, PDFs, and historical archives into git working tree
cp -f /opt/hydroanalytics/data/daily_water_situation.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/kp_stations_data.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_storages/Daily\ Water\ Situation.pdf "$APP_DIR/res_storages/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_storages/Historical\ Daily\ Storages/* "$APP_DIR/res_storages/Historical Daily Storages/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_kp/Flood\ Report.pdf "$APP_DIR/res_kp/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_kp/Historical\ KP\ Reports/* "$APP_DIR/res_kp/Historical KP Reports/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/gb_stations.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_gb/SWHP\ Report.pdf "$APP_DIR/res_gb/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_gb/Historical\ GB\ Reports/* "$APP_DIR/res_gb/Historical GB Reports/" 2>/dev/null || true
cp -f /opt/hydroanalytics/script/ft_and_percentage.js "$APP_DIR/script/" 2>/dev/null || true

# 7. Sync python scripts from git working tree into host runtime mounted folders
cp -f "$APP_DIR/res_gb/gb_stations_db.py" /opt/hydroanalytics/res_gb/ 2>/dev/null || true
cp -f "$APP_DIR/res_kp/kp_stations_db.py" /opt/hydroanalytics/res_kp/ 2>/dev/null || true
cp -f "$APP_DIR/res_storages/daily_water_situation_db.py" /opt/hydroanalytics/res_storages/ 2>/dev/null || true
cp -f "$APP_DIR/res_storages/storages.py" /opt/hydroanalytics/res_storages/ 2>/dev/null || true

cd - >/dev/null

# ── Backup: snapshot databases and PDFs before bot runs (7-day rolling) ──
BACKUP_DIR="/opt/hydroanalytics/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"
cp -f /opt/hydroanalytics/data/daily_water_situation.sqlite "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/kp_stations_data.sqlite "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_storages/Daily\ Water\ Situation.pdf "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_kp/Flood\ Report.pdf "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/gb_stations.sqlite "$BACKUP_DIR/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_gb/SWHP\ Report.pdf "$BACKUP_DIR/" 2>/dev/null || true
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
    -v /opt/hydroanalytics/res_gb:/app/res_gb \
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

# Post-run: sync any newly generated runtime files back to git working tree
cp -f /opt/hydroanalytics/res_storages/Daily\ Water\ Situation.pdf "$APP_DIR/res_storages/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_storages/Historical\ Daily\ Storages/* "$APP_DIR/res_storages/Historical Daily Storages/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_kp/Flood\ Report.pdf "$APP_DIR/res_kp/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_kp/Historical\ KP\ Reports/* "$APP_DIR/res_kp/Historical KP Reports/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/daily_water_situation.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/kp_stations_data.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/gb_stations.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_gb/SWHP\ Report.pdf "$APP_DIR/res_gb/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_gb/Historical\ GB\ Reports/* "$APP_DIR/res_gb/Historical GB Reports/" 2>/dev/null || true
cp -f /opt/hydroanalytics/script/ft_and_percentage.js "$APP_DIR/script/" 2>/dev/null || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot exited (code $EXIT_CODE): $CONTAINER_NAME" \
    >> "$LOG_DIR/cron.log"
