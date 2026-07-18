#!/bin/sh
set -e

# Create/migrate the SQLite schema on every start — `prisma db push` is idempotent
# and is how OpenGSC applies schema changes on updates (same as the VPS install).
echo "[opengsc] applying database schema to $DATABASE_URL ..."
npx prisma db push --skip-generate

echo "[opengsc] starting Next.js ..."
exec npm start
