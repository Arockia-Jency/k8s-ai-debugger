#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

NS="${K8S_NAMESPACE:-ai-debug-lab}"

# ── Pre-flight checks ──────────────────────────────────────────
command -v node    >/dev/null 2>&1 || { echo "ERROR: Node.js not found. Install v18+.";      exit 1; }

echo "Target namespace: $NS"
if [ -z "${GROQ_API_KEY:-}" ]; then
  echo "GROQ_API_KEY is not set; AI diagnosis will be unavailable."
fi

# ── Install deps if needed ──────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# ── Run ─────────────────────────────────────────────────────────
echo ""
echo "=== Step 1: Basic pod health check ==="
if ! K8S_NAMESPACE="$NS" npx tsx src/index.ts; then
  echo "Basic health check failed; continuing so the diagnostic can report the failure."
fi
echo ""
echo "=== Step 2: AI-powered live diagnosis ==="
K8S_NAMESPACE="$NS" npx tsx src/diagnose-live.ts "$@"
