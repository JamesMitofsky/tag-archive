#!/usr/bin/env bash
# Local dev WITHOUT Conductor: DB + RustFS + site, wired together on fixed ports.
# Conductor's run script does the same with per-workspace CONDUCTOR_PORT offsets;
# this mirrors it with plain defaults so a fresh clone can `pnpm dev:local`.
#
#   web    -> vite dev            http://localhost:5173
#   db     -> turso dev (sqld)    http://127.0.0.1:8081  (serves local.db)
#   studio -> drizzle-kit studio  https://local.drizzle.studio  (GUI on :4983)
#   rustfs -> RustFS S3 store     http://127.0.0.1:9000  (dev stand-in for R2)
#
# Needs the Turso CLI. Docker is optional: if the daemon isn't running, the site
# and DB still come up — only scan uploads are unavailable until you start Docker.
set -euo pipefail

DB_PORT=8081
S3_PORT=9000
STUDIO_PORT=4983

# Kill any process still holding a port from a previous dirty exit. drizzle-kit
# studio in particular can survive SIGTERM and keep :4983 bound; a stale listener
# then crashes the next boot with EADDRINUSE, and concurrently -k tears the whole
# stack down. Free our ports up front so a re-run always starts clean.
free_port() {
	local pids
	pids=$(lsof -ti "tcp:$1" 2>/dev/null || true)
	[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
}
free_port "${DB_PORT}"
free_port "${STUDIO_PORT}"

# Wire the app (vite) + init script to the local RustFS.
export S3_ENDPOINT="http://127.0.0.1:${S3_PORT}"
export R2_PUBLIC_URL="http://127.0.0.1:${S3_PORT}/tag-archive"

DB_CMD="turso dev --db-file local.db --port ${DB_PORT}"
WEB_CMD="DATABASE_URL=http://127.0.0.1:${DB_PORT} pnpm dev"
STUDIO_CMD="DATABASE_URL=http://127.0.0.1:${DB_PORT} pnpm exec drizzle-kit studio --port ${STUDIO_PORT}"

if docker info >/dev/null 2>&1; then
	# `docker run --rm` orphans its container when the CLI is force-killed on Ctrl-C
	# (it needs multiple SIGTERMs, then exits before --rm fires). Force-remove on
	# exit so the container + port 9000 are always released. Not `exec` below, so
	# this trap can run after concurrently returns.
	trap 'docker rm -f tag-archive-rustfs >/dev/null 2>&1 || true' EXIT
	docker rm -f tag-archive-rustfs >/dev/null 2>&1 || true
	RUSTFS_CMD="docker run --rm --name tag-archive-rustfs -p ${S3_PORT}:9000 -e RUSTFS_ACCESS_KEY=rustfsadmin -e RUSTFS_SECRET_KEY=rustfsadmin -e RUSTFS_ADDRESS=:9000 rustfs/rustfs:latest /data"
	SEED_IMG_CMD="DATABASE_URL=http://127.0.0.1:${DB_PORT} node --env-file-if-exists=.env scripts/seed-images.mjs"
	INIT_CMD="(node --env-file-if-exists=.env scripts/init-bucket.mjs && ${SEED_IMG_CMD}) || echo '[storage] seed skipped (unavailable)'; ${WEB_CMD}"
	pnpm exec concurrently -k -n db,rustfs,studio,web -c magenta,yellow,green,cyan \
		"${DB_CMD}" "${RUSTFS_CMD}" "${STUDIO_CMD}" "${INIT_CMD}"
else
	echo "⚠️  Docker not running — starting DB + site only. Scan uploads disabled." >&2
	echo "   Start Docker Desktop and re-run \`pnpm dev:local\` for RustFS storage." >&2
	exec pnpm exec concurrently -k -n db,studio,web -c magenta,green,cyan "${DB_CMD}" "${STUDIO_CMD}" "${WEB_CMD}"
fi
