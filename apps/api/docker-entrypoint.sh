#!/bin/sh
set -eu

echo "[kernle-api] running database migrations…"
pnpm --filter @kernle/db migrate

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[kernle-api] seeding database…"
  pnpm --filter @kernle/db seed
fi

echo "[kernle-api] starting on PORT=${PORT:-3000}"
exec pnpm --filter @kernle/api start
