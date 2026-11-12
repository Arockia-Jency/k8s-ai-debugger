
import { redactSensitive, redactText } from "./security/redact";

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

async function callAiApi(body: object): Promise<unknown> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(redactSensitive(body)),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json() as { error?: { message?: unknown } };
      if (typeof body.error?.message === "string") {
        detail = `: ${redactText(body.error.message).slice(0, 500)}`;
      }
    } catch {
      // Keep the HTTP status if the provider did not return a JSON error.
    }
    throw new Error(`Groq API request failed (HTTP ${response.status})${detail}.`);
  }

  return response.json() as Promise<unknown>;
}

async function main() {
  console.log("Sending Kubernetes evidence to the AI model...\n");

  const result = await callAiApi({
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
    max_completion_tokens: 1200,
    stream: false,
  }) as {
    choices?: { message?: { content?: string } }[];
  };

  console.log("AI DIAGNOSIS\n");
  console.log(redactText(result.choices?.[0]?.message?.content ?? "No response text."));
}

main().catch((error: unknown) => {
  console.error("AI diagnostic failed:", error);
  process.exitCode = 1;
});
