#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# FFD Other Gauges Fetch — VM Cron Runner
# Triggered by host crontab every 3 hours (replaces GitHub Actions workflow)
# Uses the hydro-python container which has cloudscraper + playwright
# ──────────────────────────────────────────────────────────────────

CONTAINER_NAME="hydro-gauge-fetch-$(date +%Y%m%d-%H%M)"
LOG_DIR="/opt/hydroanalytics/logs/gauges"
APP_DIR="/opt/hydroanalytics/app"
GIT_SSH="ssh -i /opt/hydroanalytics/git_config/.ssh/id_rsa -o StrictHostKeyChecking=no"

mkdir -p "$LOG_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting gauge fetch: $CONTAINER_NAME" \
    >> "$LOG_DIR/cron.log"

# ── Run the gauge fetch script inside the Python container ──
podman run --rm \
    --name "$CONTAINER_NAME" \
    --network host \
    -v /opt/hydroanalytics/data:/app/data \
    -v /opt/hydroanalytics/app/FFD_other_gauge_fetch:/app/FFD_other_gauge_fetch \
    -e TZ=Asia/Karachi \
    --shm-size=256m \
    localhost/hydro-python:latest \
    python FFD_other_gauge_fetch/fetch_other_gauges.py \
    >> "$LOG_DIR/$CONTAINER_NAME.log" 2>&1

FETCH_EXIT=$?

if [ $FETCH_EXIT -ne 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gauge fetch failed (exit $FETCH_EXIT)" >> "$LOG_DIR/cron.log"
    exit $FETCH_EXIT
fi

# ── Sync fetched files into git working tree ──
cp -f /opt/hydroanalytics/ffd_fetch/latest_all_gauges.json "$APP_DIR/FFD_other_gauge_fetch/" 2>/dev/null || true
cp -f /opt/hydroanalytics/data/other_gauges.sqlite "$APP_DIR/data/" 2>/dev/null || true

# ── Git commit and push the gauge data ──
cd "$APP_DIR"

# Clean any stale git state
rm -f .git/index.lock 2>/dev/null || true
git rebase --abort 2>/dev/null || true
git merge --abort 2>/dev/null || true

# Pull latest first
GIT_SSH_COMMAND="$GIT_SSH" git pull --rebase 2>/dev/null || {
    git rebase --abort 2>/dev/null || true
    GIT_SSH_COMMAND="$GIT_SSH" git fetch origin 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || true
    # Re-copy after reset
    cp -f /opt/hydroanalytics/data/other_gauges.sqlite "$APP_DIR/data/" 2>/dev/null || true
}

# Stage and commit
git add FFD_other_gauge_fetch/latest_all_gauges.json data/other_gauges.sqlite 2>/dev/null

if git diff --cached --quiet 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No gauge changes to commit" >> "$LOG_DIR/cron.log"
else
    git commit -m "Hourly update: FFD other gauges data" 2>/dev/null
    GIT_SSH_COMMAND="$GIT_SSH" git push 2>/dev/null || {
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gauge push failed, will retry next hour" >> "$LOG_DIR/cron.log"
    }
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gauge fetch completed (exit $FETCH_EXIT): $CONTAINER_NAME" \
    >> "$LOG_DIR/cron.log"
