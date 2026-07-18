#!/usr/bin/env bash
# Initialize + seed the local DB. Boots an ephemeral `turso dev` (sqld) and talks to
# it over the libsql HTTP URL — not file:local.db — so setup uses the same access
# path as the running app and never double-writes a file another process holds.
set -euo pipefail

# Own port: explicit DB_PORT wins; under Conductor use CONDUCTOR_PORT+1; else 8081.
if [ -n "${DB_PORT:-}" ]; then
	PORT="${DB_PORT}"
elif [ -n "${CONDUCTOR_PORT:-}" ]; then
	PORT="$((CONDUCTOR_PORT + 1))"
else
	PORT=8081
fi
export DATABASE_URL="http://127.0.0.1:${PORT}"

# Throwaway sqld bound to local.db; stop it on exit however this script ends.
# Silence its logs — this is a one-shot init, and the wait-loop below gates readiness.
turso dev --db-file local.db --port "${PORT}" >/dev/null 2>&1 &
SQLD=$!
trap 'kill "${SQLD}" 2>/dev/null || true' EXIT

# Wait until it accepts connections (any HTTP response means it's listening).
for _ in $(seq 1 60); do
	curl -s -o /dev/null "${DATABASE_URL}" && break
	sleep 0.5
done

# All three read DATABASE_URL: auth:schema constructs the client on import; push +
# seed apply schema and data over the sqld URL (never file:local.db directly).
pnpm auth:schema
pnpm db:push --force
pnpm db:seed

echo "[db-setup] schema generated, pushed + seeded via ${DATABASE_URL}"
