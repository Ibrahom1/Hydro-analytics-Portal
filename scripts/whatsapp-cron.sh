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

# ── Acquire lock to prevent concurrent git operations ──
LOCK_FILE="/opt/hydroanalytics/.git_push.lock"
for i in $(seq 1 24); do
    if ! [ -f "$LOCK_FILE" ]; then break; fi
    sleep 5
done
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# 1. Remove LFS hooks that block container push (they get recreated by git pull)
rm -f "$APP_DIR/.git/hooks/pre-push" "$APP_DIR/.git/hooks/post-commit" \
      "$APP_DIR/.git/hooks/post-checkout" "$APP_DIR/.git/hooks/post-merge"

# 1b. Neutralize LFS filters (git-lfs not installed in containers)
#     Prevents phantom "unstaged changes" on media files that block rebase
cd "$APP_DIR"
git config --local filter.lfs.clean cat
git config --local filter.lfs.smudge cat
git config --local filter.lfs.process ""
git config --local filter.lfs.required false

# 2. Abort any stuck rebase/merge state and clean stale locks
rm -f "$APP_DIR/.git/AUTO_MERGE" "$APP_DIR/.git/MERGE_HEAD" "$APP_DIR/.git/REBASE_HEAD" \
      "$APP_DIR/.git/CHERRY_PICK_HEAD" "$APP_DIR/.git/index.lock" 2>/dev/null || true
cd "$APP_DIR"
git rebase --abort 2>/dev/null || true
git merge --abort 2>/dev/null || true

# 3. Check for stranded unpushed commits and resolve them
UNPUSHED=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l)
if [ "$UNPUSHED" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found $UNPUSHED unpushed commit(s). Resolving..." >> "$LOG_DIR/cron.log"
    GIT_SSH_COMMAND="$GIT_SSH" git pull --rebase --autostash 2>/dev/null || {
        git rebase --abort 2>/dev/null || true
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rebase failed. Resetting to origin/main..." >> "$LOG_DIR/cron.log"
        GIT_SSH_COMMAND="$GIT_SSH" git fetch origin 2>/dev/null || true
        git reset --hard origin/main 2>/dev/null || true
    }
    GIT_SSH_COMMAND="$GIT_SSH" git push 2>/dev/null || true
fi

# 4. Pull latest from upstream (rebase to avoid merge commits)
GIT_SSH_COMMAND="$GIT_SSH" git pull --rebase --autostash 2>/dev/null || {
    git rebase --abort 2>/dev/null || true
    GIT_SSH_COMMAND="$GIT_SSH" git fetch origin 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || true
}

# 5. Sync runtime databases, PDFs, and historical archives into git working tree
cp -f /opt/hydroanalytics/data/daily_water_situation.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/kp_stations_data.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/gb_stations.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/other_gauges.sqlite "$APP_DIR/data/" 2>/dev/null || true
cp -f /opt/hydroanalytics/ffd_fetch/latest_all_gauges.json "$APP_DIR/FFD_other_gauge_fetch/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_storages/Daily\ Water\ Situation.pdf "$APP_DIR/res_storages/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_storages/Historical\ Daily\ Storages/* "$APP_DIR/res_storages/Historical Daily Storages/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_kp/Flood\ Report.pdf "$APP_DIR/res_kp/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_kp/Historical\ KP\ Reports/* "$APP_DIR/res_kp/Historical KP Reports/" 2>/dev/null || true
cp -f /opt/hydroanalytics/res_gb/SWHP\ Report.pdf "$APP_DIR/res_gb/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_gb/Historical\ GB\ Reports/* "$APP_DIR/res_gb/Historical GB Reports/" 2>/dev/null || true
# Sync ENTIRE script directory from git tree → runtime volume
# This ensures the container's /app/script/ matches git HEAD
# (prevents unstaged changes that block git pull --rebase inside the container)
rsync -a --update "$APP_DIR/script/" /opt/hydroanalytics/script/
# Also copy runtime ft_and_percentage.js back (it may be newer from storages.py)
cp -f /opt/hydroanalytics/script/ft_and_percentage.js "$APP_DIR/script/" 2>/dev/null || true

# 6. Sync python scripts from git working tree into host runtime mounted folders
cp -f "$APP_DIR/res_gb/gb_stations_db.py" /opt/hydroanalytics/res_gb/ 2>/dev/null || true
cp -f "$APP_DIR/res_kp/kp_stations_db.py" /opt/hydroanalytics/res_kp/ 2>/dev/null || true
cp -f "$APP_DIR/res_storages/daily_water_situation_db.py" /opt/hydroanalytics/res_storages/ 2>/dev/null || true
cp -f "$APP_DIR/res_storages/storages.py" /opt/hydroanalytics/res_storages/ 2>/dev/null || true

# 7. Reverse sync: copy historical PDFs FROM git tree INTO runtime volumes
#    This ensures the bot container sees ALL archived PDFs (not just the latest)
#    and prevents git from staging deletions of old files
cp -rn "$APP_DIR/res_gb/Historical GB Reports/"* "/opt/hydroanalytics/res_gb/Historical GB Reports/" 2>/dev/null || true
cp -rn "$APP_DIR/res_kp/Historical KP Reports/"* "/opt/hydroanalytics/res_kp/Historical KP Reports/" 2>/dev/null || true
cp -rn "$APP_DIR/res_storages/Historical Daily Storages/"* "/opt/hydroanalytics/res_storages/Historical Daily Storages/" 2>/dev/null || true

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
cp -f /opt/hydroanalytics/data/other_gauges.sqlite "$APP_DIR/data/" 2>/dev/null || true
# latest_all_gauges.json is already in the git tree via hydro-cron volume mount
cp -f /opt/hydroanalytics/res_gb/SWHP\ Report.pdf "$APP_DIR/res_gb/" 2>/dev/null || true
cp -rn /opt/hydroanalytics/res_gb/Historical\ GB\ Reports/* "$APP_DIR/res_gb/Historical GB Reports/" 2>/dev/null || true
cp -f /opt/hydroanalytics/script/ft_and_percentage.js "$APP_DIR/script/" 2>/dev/null || true

# ── Safety net: commit any data changes and push ──
cd "$APP_DIR"
rm -f .git/hooks/pre-push .git/hooks/post-commit .git/hooks/post-checkout .git/hooks/post-merge
git config --local filter.lfs.clean cat
git config --local filter.lfs.smudge cat
git config --local filter.lfs.process ""
git config --local filter.lfs.required false

# Discard fake LFS-caused media modifications
git checkout -- media/ 2>/dev/null || true

# Stage all data files (catches changes from hydro-cron, manual ingestions, etc.)
git add data/daily_water_situation.sqlite data/kp_stations_data.sqlite \
       data/gb_stations.sqlite data/other_gauges.sqlite \
       FFD_other_gauge_fetch/latest_all_gauges.json \
       script/ft_and_percentage.js \
       res_storages/Daily\ Water\ Situation.pdf res_kp/Flood\ Report.pdf \
       res_gb/SWHP\ Report.pdf 2>/dev/null || true
git add --ignore-removal res_storages/Historical\ Daily\ Storages \
       res_kp/Historical\ KP\ Reports res_gb/Historical\ GB\ Reports 2>/dev/null || true

# Commit if there are staged changes
if ! git diff --cached --quiet 2>/dev/null; then
    git commit -m "Auto-sync data after bot run $(date '+%Y-%m-%d %H:%M')" 2>/dev/null
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Safety net: committed data changes" >> "$LOG_DIR/cron.log"
fi

# Push any unpushed commits (from bot or from above)
UNPUSHED=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l)
if [ "$UNPUSHED" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Safety net: $UNPUSHED commit(s) to push..." >> "$LOG_DIR/cron.log"
    GIT_SSH_COMMAND="$GIT_SSH" git push origin main 2>>"$LOG_DIR/cron.log" || {
        rm -f .git/hooks/pre-push .git/hooks/post-commit
        git checkout -- media/ 2>/dev/null || true
        GIT_SSH_COMMAND="$GIT_SSH" git pull --rebase --autostash 2>/dev/null || {
            git rebase --abort 2>/dev/null || true
            GIT_SSH_COMMAND="$GIT_SSH" git fetch origin main 2>/dev/null || true
            git reset --hard origin/main 2>/dev/null || true
        }
        rm -f .git/hooks/pre-push .git/hooks/post-commit
        GIT_SSH_COMMAND="$GIT_SSH" git push origin main 2>>"$LOG_DIR/cron.log" || true
    }
fi
cd - >/dev/null

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot exited (code $EXIT_CODE): $CONTAINER_NAME" \
    >> "$LOG_DIR/cron.log"
