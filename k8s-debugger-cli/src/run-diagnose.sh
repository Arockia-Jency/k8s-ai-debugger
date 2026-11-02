#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

NS="${K8S_NAMESPACE:-ai-debug-lab}"

# ── Pre-flight checks ──────────────────────────────────────────
command -v kubectl >/dev/null 2>&1 || { echo "ERROR: kubectl not found. Install it first."; exit 1; }
command -v node    >/dev/null 2>&1 || { echo "ERROR: Node.js not found. Install v18+.";      exit 1; }

if [ -z "${GROQ_API_KEY:-}" ]; then
  echo "ERROR: GROQ_API_KEY is not set."
  echo "  Get one free at https://console.groq.com"
  echo "  Then: export GROQ_API_KEY=\"gsk_...\""
  exit 1
fi

echo "Target namespace: $NS"

if ! kubectl get namespace "$NS" >/dev/null 2>&1; then
  echo "Namespace $NS not found — creating it..."
  kubectl create namespace "$NS"
fi

# ── Install deps if needed ──────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# ── Run ─────────────────────────────────────────────────────────
echo ""
echo "=== Step 1: Basic pod health check ==="
K8S_NAMESPACE="$NS" npx tsx src/index.ts
echo ""
echo "=== Step 2: AI-powered live diagnosis ==="
K8S_NAMESPACE="$NS" npx tsx src/diagnose-live.ts
