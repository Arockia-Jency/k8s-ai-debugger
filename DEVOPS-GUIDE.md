# K8s AI Debugger — DevOps Testing Guide

AI-powered Kubernetes debugging that detects pod failures, diagnoses root causes, and sends structured alerts to Microsoft Teams. Point it at any namespace — it saves hours of manual `kubectl describe` / `kubectl logs` cycling.

## What it does

1. Connects to your K8s cluster via your current `kubectl` context
2. Collects pod statuses, events, deployment health, and container logs
3. Filters to only unhealthy workloads (CrashLoopBackOff, OOMKill, ImagePullBackOff, etc.)
4. Redacts secrets before sending anything externally
5. Sends filtered evidence to Groq AI for structured diagnosis
6. Posts the diagnosis to a Microsoft Teams channel with severity color coding

## What you get in Teams

A structured card with:
- Severity indicator (Critical / High / Medium / Low) with color coding
- List of affected pods with restart counts
- AI-generated root cause analysis as bullet points
- Recommended fix as numbered steps
- Verification kubectl commands

---

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| kubectl | any | `kubectl version --client` |
| Node.js | 18+ | `node --version` |
| K8s cluster access | any (minikube, EKS, GKE, AKS, on-prem) | `kubectl get nodes` |
| Groq API key | free | https://console.groq.com |

## Setup (5 minutes)

### 1. Get the Groq API key

Go to https://console.groq.com, sign up (free tier), and generate an API key.

### 2. Set environment variables

```bash
# Required
export GROQ_API_KEY="gsk_your-key-here"

# Optional — target a specific namespace (default: ai-debug-lab)
export K8S_NAMESPACE="your-namespace"

# Optional — enable Teams notifications
export TEAMS_WEBHOOK_URL="https://your-org.webhook.office.com/webhookb2/..."
```

### 3. (Optional) Enable Teams notifications

In your Teams channel:
1. Click `+` (Add a tab) or the `...` menu
2. Search for **Workflows** > **Post to a channel when a webhook request is received**
3. Name it "K8s AI Debugger" and select your channel
4. Copy the webhook URL

```bash
export TEAMS_WEBHOOK_URL="https://your-org.webhook.office.com/webhookb2/..."
```

To get push notifications: right-click the channel > **Channel notifications** > set **All new posts** to **Banner and feed**.

### 4. Install and run

```bash
cd k8s-debugger-cli
chmod +x src/run-diagnose.sh
./src/run-diagnose.sh
```

---

## Phase 1: Verify setup with demo scenarios

Use the included scenarios to confirm everything works before pointing at real workloads. Each one simulates a different failure type.

### Scenario 1 — CrashLoopBackOff (app crash)

```bash
kubectl apply -f scenarios/1-crash-loop.yaml -n ${K8S_NAMESPACE:-ai-debug-lab}
sleep 30
cd k8s-debugger-cli && ./src/run-diagnose.sh
```

Expected: AI detects intentional exit code 1, diagnoses CrashLoopBackOff, recommends checking the entrypoint.

### Scenario 2 — OOMKilled (memory exhaustion)

```bash
kubectl apply -f scenarios/2-oom-kill.yaml -n ${K8S_NAMESPACE:-ai-debug-lab}
sleep 20
cd k8s-debugger-cli && ./src/run-diagnose.sh
```

Expected: AI detects OOMKilled termination reason, recommends increasing memory limits.

### Scenario 3 — ImagePullBackOff (wrong image)

```bash
kubectl apply -f scenarios/3-image-pull-error.yaml -n ${K8S_NAMESPACE:-ai-debug-lab}
sleep 15
cd k8s-debugger-cli && ./src/run-diagnose.sh
```

Expected: AI detects ImagePullBackOff, recommends verifying the image tag.

### Clean up demo scenarios

```bash
kubectl delete -f scenarios/ -n ${K8S_NAMESPACE:-ai-debug-lab}
```

---

## Phase 2: Test with real workloads

Point the debugger at any namespace in your cluster:

```bash
export K8S_NAMESPACE="production"
cd k8s-debugger-cli && ./src/run-diagnose.sh
```

If all pods are healthy, you'll see "No issues detected" — that's correct behavior.

To test with a namespace that has known issues:

```bash
export K8S_NAMESPACE="your-team-namespace"
cd k8s-debugger-cli
npx tsx src/diagnose-live.ts
```

---

## Running on a schedule

To run automatically every 5 minutes and alert on failures:

```bash
# Add to crontab
*/5 * * * * cd /path/to/k8s-debugger-cli && \
  GROQ_API_KEY="gsk_..." \
  TEAMS_WEBHOOK_URL="https://..." \
  K8S_NAMESPACE="production" \
  npx tsx src/diagnose-live.ts >> /var/log/k8s-debugger.log 2>&1
```

---

## How it works

```
K8s Cluster                    CLI                         AI + Teams
┌─────────────┐    kubectl    ┌──────────────┐   REST    ┌───────────┐
│ Pods         │───────────►  │ Collect      │─────────► │ Groq AI   │
│ Events       │              │ evidence     │           │ Diagnosis │
│ Deployments  │              │   ↓          │           └─────┬─────┘
│ Logs         │              │ Filter +     │                 │
└─────────────┘              │ redact       │           ┌─────▼─────┐
                              │   ↓          │           │ MS Teams  │
                              │ Send to AI   │◄──────────│ Webhook   │
                              └──────────────┘           └───────────┘
```

### Scripts

| Script | Purpose | AI needed? |
|---|---|---|
| `src/index.ts` | Basic pod health check | No |
| `src/collect-evidence.ts` | Gather full cluster evidence | No |
| `src/diagnose-live.ts` | Full pipeline: collect + AI diagnosis + Teams alert | Yes |
| `src/ai-test.ts` | Test AI API connectivity with fake data | Yes |
| `src/run-diagnose.sh` | One-command runner with pre-flight checks | Yes |

### What gets sent to the AI

Only filtered, redacted evidence:
- Pod names, phases, container states
- Restart counts and exit codes
- Last 40 lines of logs (trimmed to 2500 chars), secrets stripped
- Warning events from the last hour
- Deployment replica counts

What is NOT sent: full cluster config, secrets, service account tokens, internal IPs.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | Yes | — | API key from https://console.groq.com |
| `K8S_NAMESPACE` | No | `ai-debug-lab` | Kubernetes namespace to scan |
| `TEAMS_WEBHOOK_URL` | No | — | Teams webhook URL for notifications |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `GROQ_API_KEY is not set` | `export GROQ_API_KEY="gsk_..."` |
| `No issues detected` | Your pods are healthy — deploy a scenario from `scenarios/` to test |
| `Teams notification failed` | Check your webhook URL is correct and the Workflow is active |
| `kubectl connection refused` | Make sure `kubectl get nodes` works first |
| `Evidence collector did not return JSON` | Check `npx tsx src/collect-evidence.ts` runs on its own |
| Namespace not found | Set `K8S_NAMESPACE` or let the script create `ai-debug-lab` |
