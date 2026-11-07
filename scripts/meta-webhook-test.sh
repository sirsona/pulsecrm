#!/usr/bin/env bash
# Smoke-test the Meta (WhatsApp) webhook served at /webhooks/meta.
#
# Usage: ./scripts/meta-webhook-test.sh [base-url]
#   base-url defaults to http://localhost:5000. Pass the ngrok base URL
#   (e.g. https://either-refurbish-wife.ngrok-free.dev) to test the public
#   path Meta actually uses.
#
# Checks:
#   1. GET verification handshake echoes hub.challenge (200)
#   2. GET with a wrong verify token is rejected (403)
#   3. POST without x-hub-signature-256 is rejected (401)
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/server/.env"
BASE_URL="${1:-http://localhost:5000}"
ENDPOINT="$BASE_URL/webhooks/meta"

TOKEN=$(grep -E '^META_VERIFY_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$TOKEN" ]; then
  echo "META_VERIFY_TOKEN not found in $ENV_FILE" >&2
  exit 1
fi

pass=0
fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then
    echo "PASS: $1"
    pass=$((pass + 1))
  else
    echo "FAIL: $1 (expected $2, got $3)"
    fail=$((fail + 1))
  fi
}

CHALLENGE="test-challenge-42"

echo "--- 1. GET verification (valid token) ---"
BODY=$(curl -s -m 5 -w '\n%{http_code}' \
  "$ENDPOINT?hub.mode=subscribe&hub.verify_token=$TOKEN&hub.challenge=$CHALLENGE")
CODE=$(printf '%s' "$BODY" | tail -1)
PAYLOAD=$(printf '%s' "$BODY" | sed '$d')
check "challenge echoed" "$CHALLENGE" "$PAYLOAD"
check "status 200" "200" "$CODE"

echo "--- 2. GET verification (wrong token) ---"
CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' \
  "$ENDPOINT?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=$CHALLENGE")
check "status 403" "403" "$CODE"

echo "--- 3. POST without signature ---"
CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{"object":"whatsapp_business_account","entry":[]}')
check "status 401" "401" "$CODE"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
