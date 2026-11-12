# Kubernetes AI Debugger

A small TypeScript CLI that checks Kubernetes workloads, gathers evidence for unhealthy pods, asks Groq for a diagnosis, and can post the result to Microsoft Teams.

## What it does

1. Checks pod health in the selected namespace.
2. Collects relevant pod status, warning events, deployment replica counts, and recent logs for unhealthy workloads.
3. Redacts common credential patterns and masks application class names before sending evidence to Groq.
4. Produces a root cause summary, recommended fix, and verification steps.
5. Optionally posts the diagnosis or an operational failure alert to Teams.

The AI prompt can ask questions about collected evidence with `--ask`. Prompts do not execute shell commands or make cluster changes. Image updates are a separate, explicitly approved option described below.

## Requirements

- Node.js 18 or newer
- `kubectl` configured for the cluster and namespace you want to inspect
- A Groq API key for AI diagnosis
- A Microsoft Teams Workflow webhook URL for Teams notifications (optional)

Check cluster access with:

```bash
kubectl get nodes
```

## Configure and run

From the repository root, set the required API key and choose a namespace. The default namespace is `ai-debug-lab`; it must already exist.

```bash
export GROQ_API_KEY="gsk_your-key-here"
export K8S_NAMESPACE="ai-debug-lab"
# Optional: enable Teams notifications
export TEAMS_WEBHOOK_URL="https://your-teams-workflow-webhook"

cd k8s-debugger-cli
./src/run-diagnose.sh
```

The runner installs npm dependencies if `node_modules` is missing. To ask a question about the evidence:

```bash
./src/run-diagnose.sh --ask "Why is imagepull-demo unable to start?"
```

If the Kubernetes API cannot be reached, the basic health check reports its failure and the live diagnostic step attempts to send an operational alert to Teams. That alert requires `TEAMS_WEBHOOK_URL` and network access to the webhook.

## Try the included failure scenarios

Run these from the repository root, with `K8S_NAMESPACE` set and the namespace already created. Apply scenarios only in a disposable test namespace.

### CrashLoopBackOff

```bash
kubectl apply -f scenarios/1-crash-loop.yaml -n "$K8S_NAMESPACE"
kubectl get pods -n "$K8S_NAMESPACE" -w
```

Wait until the pod is restarting, press Ctrl+C, then run:

```bash
cd k8s-debugger-cli
./src/run-diagnose.sh --ask "Why is the crash demo restarting?"
```

### ImagePullBackOff

Remove the crash-loop scenario first so its results do not mix with this test:

```bash
kubectl delete -f scenarios/1-crash-loop.yaml -n "$K8S_NAMESPACE" --ignore-not-found
kubectl apply -f scenarios/3-image-pull-error.yaml -n "$K8S_NAMESPACE"
kubectl get pods -n "$K8S_NAMESPACE" -w
```

When the pod shows `ImagePullBackOff`, press Ctrl+C and run:

```bash
cd k8s-debugger-cli
./src/run-diagnose.sh --ask "Why can't the imagepull demo start?"
```

### Preview a replacement image

The preview performs a Kubernetes server-side dry run and does not apply the image change. Set the deployment, container, and a valid replacement image:

```bash
cd k8s-debugger-cli
K8S_PREVIEW_DEPLOYMENT=imagepull-demo \
K8S_PREVIEW_CONTAINER=imagepull-demo \
K8S_PREVIEW_IMAGE="nginx:alpine" \
./src/run-diagnose.sh
```

Server-side validation requires permission to patch the Deployment, even though the dry run does not persist a change.

To apply the image after preview, add `--approve-image`:

```bash
K8S_PREVIEW_DEPLOYMENT=imagepull-demo \
K8S_PREVIEW_CONTAINER=imagepull-demo \
K8S_PREVIEW_IMAGE="nginx:alpine" \
./src/run-diagnose.sh --approve-image
```

The CLI requires an interactive terminal and asks you to type the exact confirmation phrase it displays, including the namespace, deployment, container, and image. Only then does it update the Deployment and check rollout status. Use a disposable namespace for this test.

### Clean up

From the repository root:

```bash
kubectl delete -f scenarios/ -n "$K8S_NAMESPACE" --ignore-not-found
```

## Security and data handling

- The collector does not read Kubernetes Secret objects, kubeconfig files, or service account tokens.
- Evidence sent to Groq is filtered to relevant unhealthy workloads. Common credential patterns are redacted, and resource identifiers and fully qualified application class names are masked.
- Redaction is pattern-based. It may not catch every secret or private detail in application logs and events, so review your data handling requirements and start with a test namespace.
- Image changes are not made from natural-language prompts. Applying an image requires the explicit `--approve-image` option and typing the displayed confirmation phrase.

## Useful files

- `k8s-debugger-cli/src/run-diagnose.sh` — main runner
- `k8s-debugger-cli/src/index.ts` — basic pod health check
- `k8s-debugger-cli/src/collect-evidence.ts` — Kubernetes evidence collection
- `k8s-debugger-cli/src/diagnose-live.ts` — AI diagnosis, Teams notifications, and image preview/apply flow
- `k8s-debugger-cli/src/security/redact.ts` — sensitive text redaction and masking
- `scenarios/` — sample Kubernetes failure manifests
- `DEVOPS-GUIDE.md` — expanded setup and operations guide
