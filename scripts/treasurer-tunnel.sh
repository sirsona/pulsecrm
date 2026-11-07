#!/usr/bin/env bash
# Starts a Cloudflare quick tunnel for the treasurer dashboard and keeps
# server/.env TREASURER_URL in sync with the (random) tunnel URL.
# Run under systemd (treasurer-tunnel.service) with Restart=always.
set -uo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../server" && pwd)"
LOG="/tmp/opencode/cloudflared.log"
CLOUDFLARED="/usr/bin/cloudflared"
TARGET="http://localhost:3001"

mkdir -p "$(dirname "$LOG")"
: > "$LOG"

"$CLOUDFLARED" tunnel --url "$TARGET" --protocol http2 --edge-ip-version 4 --no-autoupdate >> "$LOG" 2>&1 &
CF_PID=$!

URL=""
for _ in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -n "$URL" ]; then
  CURRENT=$(grep -E '^TREASURER_URL=' "$SERVER_DIR/.env" | cut -d= -f2-)
  if [ "$CURRENT" != "$URL" ]; then
    grep -v '^TREASURER_URL=' "$SERVER_DIR/.env" > "$SERVER_DIR/.env.tmp" && \
      mv "$SERVER_DIR/.env.tmp" "$SERVER_DIR/.env"
    printf 'TREASURER_URL=%s\n' "$URL" >> "$SERVER_DIR/.env"
    touch "$SERVER_DIR/index.js"
    echo "TREASURER_URL updated to $URL"
  else
    echo "TREASURER_URL unchanged ($URL)"
  fi
else
  echo "WARNING: could not detect the tunnel URL" >&2
fi

wait "$CF_PID"
