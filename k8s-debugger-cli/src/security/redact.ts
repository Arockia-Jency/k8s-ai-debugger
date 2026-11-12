const NON_SECRET_TOKEN_FIELDS = new Set([
  "max_tokens",
  "max_completion_tokens",
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "reasoning_tokens",
]);

function isSensitiveField(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/-/g, "_");

  if (NON_SECRET_TOKEN_FIELDS.has(normalized)) return false;

  return /(?:^|_)(?:password|passwd|pwd|secret|token|api_key|client_secret|authorization|proxy_authorization|cookie|set_cookie|private_key|ssh_key|credential|credentials|kubeconfig)(?:_|$)/.test(normalized);
}

/** Redact credential-like values from log lines, event messages, and model output. */
export function redactText(input: string): string {
  return input
    // Private keys can span multiple lines.
    .replace(
      /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/gi,
      "[REDACTED PRIVATE KEY]",
    )
    // Hide fully qualified application class names from stack traces.
    .replace(/\b[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.[A-Z][\w$]*(?:\$[\w$]+)*\b/g, "[APP_CLASS]")
    .replace(/\b[A-Z][\w$]*\.(?:java|kt|scala|groovy|cs)(?=:\d+\)?)/g, "[APP_SOURCE]")
    // URL userinfo, including passwords.
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@")
    // Common bearer/basic authorization headers and JWTs.
    .replace(/\b(Bearer|Basic)\s+[^\s,;"']+/gi, "$1 [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\b/g, "[REDACTED JWT]")
    // Credential fields in JSON.
    .replace(
      /("(?:[^"\\]*(?:password|passwd|pwd|secret|token|api[_-]?key|client[_-]?secret|authorization|cookie|private[_-]?key|ssh[_-]?key|credential|kubeconfig)[^"\\]*)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[REDACTED]"',
    )
    // Credential assignments in YAML, environment output, and plain text.
    .replace(
      /(\b[\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|ssh[_-]?key|credentials?|kubeconfig)[\w.-]*\b)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      "$1=[REDACTED]",
    )
    // Recognizable provider credentials, even when logged without a field name.
    .replace(/\b(?:gsk_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g, "[REDACTED TOKEN]");
}

/** Recursively redact credential-bearing fields as a second line of defense. */
export function redactSensitive(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, fieldValue]) => [
        key,
        isSensitiveField(key) ? "[REDACTED]" : redactSensitive(fieldValue),
      ]),
    );
  }
  return value;
}
