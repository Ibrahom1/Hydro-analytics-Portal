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

# ── Sync fetched files ──
# hydro-cron writes latest_all_gauges.json directly to app/FFD_other_gauge_fetch (git tree)
# Copy FROM git tree TO runtime volume (so hydro-proxy always has the latest)
cp -f "$APP_DIR/FFD_other_gauge_fetch/latest_all_gauges.json" /opt/hydroanalytics/ffd_fetch/ 2>/dev/null || true
# Copy runtime data into git tree for commit
cp -f /opt/hydroanalytics/data/other_gauges.sqlite "$APP_DIR/data/" 2>/dev/null || true

# ── Git commit and push the gauge data ──
cd "$APP_DIR"

# ── Acquire lock to prevent concurrent git operations ──
LOCK_FILE="/opt/hydroanalytics/.git_push.lock"
for i in $(seq 1 24); do
    if ! [ -f "$LOCK_FILE" ]; then break; fi
    sleep 5
done
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Clean any stale git state
rm -f .git/index.lock 2>/dev/null || true
rm -f .git/hooks/pre-push .git/hooks/post-commit .git/hooks/post-checkout .git/hooks/post-merge 2>/dev/null || true
git rebase --abort 2>/dev/null || true
git merge --abort 2>/dev/null || true

# Neutralize LFS filters (git-lfs not installed in containers)
git config --local filter.lfs.clean cat
git config --local filter.lfs.smudge cat
git config --local filter.lfs.process ""
git config --local filter.lfs.required false

# ── CRITICAL: Discard fake LFS-caused "modifications" to media files ──
# Without this, git pull/push fails because 60+ media files appear modified
git checkout -- media/ 2>/dev/null || true

# Pull latest first
GIT_SSH_COMMAND="$GIT_SSH" git pull --rebase --autostash 2>/dev/null || {
    git rebase --abort 2>/dev/null || true
    GIT_SSH_COMMAND="$GIT_SSH" git fetch origin main 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || true
    # Re-copy after reset
    cp -f /opt/hydroanalytics/data/other_gauges.sqlite "$APP_DIR/data/" 2>/dev/null || true
}
# Re-neutralize after pull (pull regenerates hooks)
rm -f .git/hooks/pre-push .git/hooks/post-commit 2>/dev/null || true
git checkout -- media/ 2>/dev/null || true

# Stage and commit
git add FFD_other_gauge_fetch/latest_all_gauges.json data/other_gauges.sqlite 2>/dev/null

if git diff --cached --quiet 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No gauge changes to commit" >> "$LOG_DIR/cron.log"
else
    git commit -m "Hourly update: FFD other gauges data" 2>/dev/null
    GIT_SSH_COMMAND="$GIT_SSH" git push origin main 2>>"$LOG_DIR/cron.log" || {
        # Retry once after fresh pull
        rm -f .git/hooks/pre-push .git/hooks/post-commit 2>/dev/null || true
        git checkout -- media/ 2>/dev/null || true
        GIT_SSH_COMMAND="$GIT_SSH" git pull --rebase --autostash 2>/dev/null || {
            git rebase --abort 2>/dev/null || true
            GIT_SSH_COMMAND="$GIT_SSH" git fetch origin main 2>/dev/null || true
            git reset --hard origin/main 2>/dev/null || true
            cp -f /opt/hydroanalytics/data/other_gauges.sqlite "$APP_DIR/data/" 2>/dev/null || true
            git add FFD_other_gauge_fetch/latest_all_gauges.json data/other_gauges.sqlite 2>/dev/null
            git commit -m "Hourly update: FFD other gauges data" 2>/dev/null
        }
        rm -f .git/hooks/pre-push .git/hooks/post-commit 2>/dev/null || true
        GIT_SSH_COMMAND="$GIT_SSH" git push origin main 2>>"$LOG_DIR/cron.log" || {
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gauge push failed after retry" >> "$LOG_DIR/cron.log"
        }
    }
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gauge fetch completed (exit $FETCH_EXIT): $CONTAINER_NAME" \
    >> "$LOG_DIR/cron.log"

