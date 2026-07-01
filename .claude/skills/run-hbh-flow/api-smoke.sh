#!/usr/bin/env bash
# Smoke-test the hbh-flow REST API: verify it's up, log in (cookie + CSRF),
# and hit an authenticated endpoint. Exit 0 = healthy.
#
# Usage: BASE=http://localhost:3001 ./api-smoke.sh
set -euo pipefail

BASE="${BASE:-http://localhost:3001}"
EMAIL="${EMAIL:-flow@honeybeeherb.com}"
PASSWORD="${PASSWORD:-hbh-admin-1234}"
JAR="$(mktemp)"

echo "1) OpenAPI reachable…"
curl -sf "$BASE/api/docs.json" -o /dev/null && echo "   ok: $BASE/api"

echo "2) Login (sets HttpOnly access_token cookie, returns csrfToken)…"
LOGIN=$(curl -sf -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
CSRF=$(printf '%s' "$LOGIN" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
[ -n "$CSRF" ] && echo "   ok: got csrfToken"

echo "3) Authenticated whoami (needs cookie + X-CSRF-Token header)…"
curl -sf -b "$JAR" -H "X-CSRF-Token: $CSRF" "$BASE/api/auth/whoami" | sed 's/^/   /'

echo "4) Authenticated list (pagination uses page/limit, NOT take)…"
curl -sf -b "$JAR" -H "X-CSRF-Token: $CSRF" "$BASE/api/workflows?limit=2" \
  | head -c 200 | sed 's/^/   /'; echo

rm -f "$JAR"
echo "SMOKE OK"
