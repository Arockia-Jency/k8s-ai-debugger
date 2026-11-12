
import * as k8s from "@kubernetes/client-node";
import { redactSensitive, redactText } from "./security/redact";

const namespace = process.env.K8S_NAMESPACE || "ai-debug-lab";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const appsApi = kc.makeApiClient(k8s.AppsV1Api);

async function main() {
  console.log(`Collecting live evidence from namespace: ${namespace}\n`);

  const [podResponse, eventResponse, deploymentResponse] =
    await Promise.all([
      coreApi.listNamespacedPod({ namespace }),
      coreApi.listNamespacedEvent({ namespace }),
      appsApi.listNamespacedDeployment({ namespace }),
    ]);

  const pods = await Promise.all(
    podResponse.items.map(async (pod) => {
      const name = pod.metadata?.name ?? "unknown";
      const statuses = pod.status?.containerStatuses ?? [];

      const containers = statuses.map((container) => ({
        name: container.name,
        ready: container.ready,
        restartCount: container.restartCount,
        waitingReason: container.state?.waiting?.reason,
        waitingMessage: container.state?.waiting?.message,
        terminatedReason: container.state?.terminated?.reason,
        exitCode: container.state?.terminated?.exitCode,
        lastTerminationReason:
          container.lastState?.terminated?.reason,
        lastExitCode: container.lastState?.terminated?.exitCode,
      }));

      const isProblematic =
        pod.status?.phase !== "Running" ||
        statuses.some(
          (container) =>
            !container.ready ||
            container.restartCount > 0 ||
            Boolean(container.state?.waiting?.reason) ||
            Boolean(container.state?.terminated),
        );

      let logs: string[] = [];

      if (isProblematic) {
        logs = await Promise.all(
          statuses.map(async (container) => {
            try {
              const result = await coreApi.readNamespacedPodLog({
                name,
                namespace,
                container: container.name,
                tailLines: 40,
              });

              const body = String(result);
              return `Container ${container.name}:\n${redactText(body)}`;
            } catch {
              return `Container ${container.name}: current logs unavailable`;
            }
          }),
        );

        // Also try logs from the previous container instance after a restart.
        const restarted = statuses.filter(
          (container) => container.restartCount > 0,
        );

        const previousLogs = await Promise.all(
          restarted.map(async (container) => {
            try {
              const result = await coreApi.readNamespacedPodLog({
                name,
                namespace,
                container: container.name,
                previous: true,
                tailLines: 40,
              });

              return `Previous logs (${container.name}):\n${redactText(String(result))}`;
            } catch {
              return `Previous logs (${container.name}): unavailable`;
            }
          }),
        );

        logs.push(...previousLogs);
      }

      return {
        name,
        phase: pod.status?.phase,
        node: pod.spec?.nodeName,
        containers,
        logs,
      };
    }),
  );

  const deployments = deploymentResponse.items.map((deployment) => ({
    name: deployment.metadata?.name,
    desiredReplicas: deployment.spec?.replicas ?? 0,
    availableReplicas: deployment.status?.availableReplicas ?? 0,
    readyReplicas: deployment.status?.readyReplicas ?? 0,
  }));

  const events = eventResponse.items
    .filter((event) => {
      const time = event.lastTimestamp ?? event.eventTime;
      if (!time) return true;

      return Date.now() - new Date(time).getTime() <
        60 * 60 * 1000;
    })
    .map((event) => ({
      type: event.type,
      reason: event.reason,
      message: redactText(event.message ?? ""),
      involvedObject: event.involvedObject?.name,
      count: event.count,
    }));

  const evidence = {
    collectedAt: new Date().toISOString(),
    namespace,
    pods,
    deployments,
    events,
  };

  console.log(JSON.stringify(redactSensitive(evidence), null, 2));
}

main().catch((error: unknown) => {
  console.error("Evidence collection failed:", error);
  process.exitCode = 1;
});

