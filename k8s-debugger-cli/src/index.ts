
import * as k8s from "@kubernetes/client-node";

async function main() {
    const namespace = process.env.K8S_NAMESPACE || "ai-debug-lab";
    console.log("Kubernetes AI Debugger");
    console.log(`Inspecting namespace: ${namespace}\n`);

    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    const api = kc.makeApiClient(k8s.CoreV1Api);

    const response = await api.listNamespacedPod({
        namespace,
    });

    let issueCount = 0;

    for (const pod of response.items) {
        const name = pod.metadata?.name ?? "unknown";
        const phase = pod.status?.phase ?? "Unknown";
        const statuses = pod.status?.containerStatuses ?? [];

        const restarts = statuses.reduce(
            (total, container) => total + (container.restartCount ?? 0),
            0,
        );

        const notReady =
            statuses.length === 0 ||
            statuses.some((container) => !container.ready);

        const waitingReasons = statuses
            .map((container) => container.state?.waiting?.reason)
            .filter((reason): reason is string => Boolean(reason));

        const terminatedReasons = statuses
            .map((container) => container.state?.terminated?.reason)
            .filter((reason): reason is string => Boolean(reason));

        const problems: string[] = [];

        if (phase === "Failed" || phase === "Unknown") {
            problems.push(`Pod phase is ${phase}`);
        }

        if (waitingReasons.length > 0) {
            problems.push(`Container waiting: ${waitingReasons.join(", ")}`);
        }

        if (terminatedReasons.length > 0) {
            problems.push(`Container terminated: ${terminatedReasons.join(", ")}`);
        }

        if (restarts > 0) {
            problems.push(`Container has restarted ${restarts} time(s)`);
        }

        if (notReady) {
            problems.push("Pod has no ready container");
        }

        console.log(`Pod: ${name}`);
        console.log(`Phase: ${phase}`);
        console.log(`Restarts: ${restarts}`);

        if (problems.length > 0) {
            issueCount++;
            console.log("Diagnosis: ISSUE DETECTED");

            for (const problem of problems) {
                console.log(`  - ${problem}`);
            }
        } else {
            console.log("Diagnosis: HEALTHY");
        }

        console.log("-------------------------");
    }

    console.log(`\nPods with detected issues: ${issueCount}`);
}

main().catch((error) => {
    console.error("Diagnostic failed:", error);
    process.exitCode = 1;
});
