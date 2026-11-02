
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error("GROQ_API_KEY is not configured.");
}

const evidence = {
  namespace: "ai-debug-lab",
  workload: "crash-demo",
  podPhase: "Running",
  containerState: "Waiting",
  waitingReason: "CrashLoopBackOff",
  exitCode: 1,
  restartCount: 7,
  recentLogs: ["Simulating application crash"],
  events: [
    "Back-off restarting failed container",
  ],
};

function callAiApi(body: object): string {
  const tmpFile = join(tmpdir(), `k8s-debugger-${Date.now()}.json`);
  writeFileSync(tmpFile, JSON.stringify(body));
  try {
    return execFileSync("curl", [
      "-s", "--max-time", "120",
      "https://api.groq.com/openai/v1/chat/completions",
      "-X", "POST",
      "-H", "Content-Type: application/json",
      "-H", `Authorization: Bearer ${apiKey}`,
      "-d", `@${tmpFile}`,
    ], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function main() {
  console.log("Sending Kubernetes evidence to the AI model...\n");

  const raw = callAiApi({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: `You are a Kubernetes troubleshooting assistant.
Analyze only the supplied evidence.
Return these sections:
1. Issue
2. Evidence
3. Likely root cause
4. Severity and impact
5. Recommended fix
6. Verification steps
Clearly label assumptions and missing evidence.
Never claim certainty without supporting evidence.
Do not recommend destructive actions.`,
      },
      {
        role: "user",
        content: JSON.stringify(evidence, null, 2),
      },
    ],
    temperature: 0.2,
    max_tokens: 1200,
    stream: false,
  });

  const result = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[];
  };

  console.log("AI DIAGNOSIS\n");
  console.log(result.choices?.[0]?.message?.content ?? "No response text.");
}

try {
  main();
} catch (error: unknown) {
  console.error("AI diagnostic failed:", error);
  process.exitCode = 1;
}
