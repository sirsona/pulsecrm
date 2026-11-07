#!/usr/bin/env bash
# Timestamped logical backup of the compose Postgres (run from the repo root).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

DB="${POSTGRES_DB:-crm}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/crm-${DB}-${STAMP}.sql"

mkdir -p backups
docker compose exec -T postgres pg_dump -U crm_user -d "$DB" --clean --if-exists > "$OUT"
gzip -f "$OUT"
echo "backup written: ${OUT}.gz"
