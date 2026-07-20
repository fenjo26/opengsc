#!/bin/bash
# One-command updater — pulls the latest main, installs deps, migrates the DB, rebuilds,
# and restarts the PM2 process. Triggered from the UI (Settings → owner-only "Update" button,
# which spawns this detached and streams the log) or run by hand:  bash update.sh
#
# It cd's to its own directory so it works regardless of where it's invoked from.
set -o pipefail
cd "$(dirname "$0")" || exit 1

echo "___OPENGSC_UPDATE_START___"
echo "[update] $(date -u) — starting in $(pwd)"

echo "[update] git fetch..."
git fetch origin || { echo "[update] git fetch FAILED"; echo "___OPENGSC_UPDATE_FAIL___"; exit 1; }

echo "[update] git reset --hard origin/main..."
git reset --hard origin/main || { echo "[update] git reset FAILED"; echo "___OPENGSC_UPDATE_FAIL___"; exit 1; }

echo "[update] npm install..."
npm i || { echo "[update] npm i FAILED"; echo "___OPENGSC_UPDATE_FAIL___"; exit 1; }

echo "[update] prisma db push..."
npx prisma db push --skip-generate || npx prisma db push || { echo "[update] prisma db push FAILED"; echo "___OPENGSC_UPDATE_FAIL___"; exit 1; }

echo "[update] npm run build..."
npm run build || { echo "[update] build FAILED"; echo "___OPENGSC_UPDATE_FAIL___"; exit 1; }

# Mark success BEFORE the restart — pm2 restart kills this process's parent shell context,
# so the UI must be able to see the done marker in the log even if the restart truncates output.
echo "___OPENGSC_UPDATE_DONE___"
echo "[update] restarting PM2 process..."
pm2 restart opengsc || pm2 restart all || echo "[update] pm2 restart failed — restart manually"
