#!/usr/bin/env bash
# ── scripts/docker-test.sh ────────────────────────────────────────────────────
#
# Convenience wrapper around docker-compose.full.yml.
# Handles setup, teardown, and artifact collection in one script.
#
# Usage:
#   ./scripts/docker-test.sh                         # run full ci suite
#   ./scripts/docker-test.sh tests/security/         # run specific folder
#   ./scripts/docker-test.sh --build                 # rebuild image first
#   ./scripts/docker-test.sh --clean                 # teardown + remove volumes
#
# Exit codes:
#   0  all tests passed
#   1  one or more tests failed
#   2  infrastructure error (Docker not running, compose parse error, etc.)

set -euo pipefail

COMPOSE_FILE="docker-compose.full.yml"
TEST_ARGS="${*}"
REBUILD=false
CLEAN=false

# ── Parse flags ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --build) REBUILD=true ;;
    --clean) CLEAN=true ;;
  esac
done

# ── Clean mode ────────────────────────────────────────────────────────────────
if [ "$CLEAN" = true ]; then
  echo "🧹 Tearing down full stack and removing volumes..."
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
  echo "✓ Clean complete"
  exit 0
fi

# ── Prerequisites check ───────────────────────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Start Docker Desktop and retry."
  exit 2
fi

if [ ! -d "documenso-app" ]; then
  echo "📥 documenso-app not found — cloning (one-time setup)..."
  git clone https://github.com/documenso/documenso.git documenso-app --depth=1
fi

# ── Build (optional) ──────────────────────────────────────────────────────────
if [ "$REBUILD" = true ]; then
  echo "🔨 Rebuilding test image..."
  docker compose -f "$COMPOSE_FILE" build test-runner
fi

# ── Run ───────────────────────────────────────────────────────────────────────
echo ""
echo "🐳 Starting full stack (Documenso + test runner)..."
echo "   Compose file: $COMPOSE_FILE"
echo "   Test args:    ${TEST_ARGS:-<default: --project=ci>}"
echo ""

# Pull latest Documenso images
docker compose -f "$COMPOSE_FILE" pull postgres inbucket documenso 2>/dev/null || true

# Start the stack; --abort-on-container-exit stops all containers when the
# test-runner exits, so we don't leave Documenso running in the background.
docker compose -f "$COMPOSE_FILE" up \
  --abort-on-container-exit \
  --exit-code-from test-runner

EXIT_CODE=$?

# ── Artifacts ─────────────────────────────────────────────────────────────────
echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "✅ All tests passed"
else
  echo "❌ Tests failed (exit code: $EXIT_CODE)"
fi

echo ""
echo "📁 Artifacts written to:"
echo "   ./test-results/     (summary.md, flaky-tests.json)"
echo "   ./allure-results/   (raw Allure data — run pnpm allure:generate to view)"
echo "   ./playwright-report/ (HTML report)"

# ── Teardown ──────────────────────────────────────────────────────────────────
echo ""
echo "🧹 Stopping containers..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans

exit $EXIT_CODE
