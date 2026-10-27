#!/usr/bin/env bash
# Prepares the deterministic demo environment for Relay's "Race to Green".
#
# Usage:
#   ./scripts/prepare-demo.sh [RUNTIME_AUTH_TOKEN]
#
# - Copies the buggy calculator fixture into data/demo-project (gitignored)
# - Initializes it as a git repo with a baseline commit
# - If RUNTIME_AUTH_TOKEN is given and the runtime is up, registers the
#   project and creates the "Node Test Suite" validation profile via the API.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_SRC="$ROOT_DIR/tests/fixtures/demo-project"
DEMO_DST="$ROOT_DIR/data/demo-project"

echo "==> Preparing demo project"
rm -rf "$DEMO_DST"
mkdir -p "$DEMO_DST"
cp "$DEMO_SRC/package.json" "$DEMO_SRC/index.js" "$DEMO_SRC/test.js" "$DEMO_DST/"

cd "$DEMO_DST"
if [ ! -d .git ]; then
  git init -b main --quiet
fi
git config user.name "Relay Demo"
git config user.email "demo@relay.local"
git add -A
git commit -m "chore: baseline buggy pricing calculator" --quiet --allow-empty

echo "    Demo repo ready at: $DEMO_DST"
echo "    Base commit: $(git rev-parse --short HEAD)"
echo "    Verify tests fail: (cd $DEMO_DST && node test.js) -> expected failure"

TOKEN="${1:-}"
if [ -n "$TOKEN" ]; then
  echo "==> Registering project with runtime (http://127.0.0.1:4400)"
  PROJECT_JSON=$(curl -fsS -X POST http://127.0.0.1:4400/api/v1/projects \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"repoPath\": \"$DEMO_DST\"}")
  PROJECT_ID=$(echo "$PROJECT_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
  echo "    Project registered: $PROJECT_ID"

  echo "==> Creating 'Node Test Suite' validation profile"
  curl -fsS -X POST "http://127.0.0.1:4400/api/v1/projects/$PROJECT_ID/validation-profiles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name": "Node Test Suite", "commands": [{"label": "Unit Tests", "executable": "node", "args": ["test.js"], "timeoutMs": 30000}]}' \
    > /dev/null
  echo "    Validation profile created."
fi

echo ""
echo "Next steps:"
echo "  1. RELAY_DEMO_MODE=true pnpm dev"
echo "  2. Open http://localhost:5173 and paste the runtime token"
echo "  3. Register $DEMO_DST (if not auto-registered)"
echo "  4. Launch a run with agents: demo-winner + demo-loser"
