/**
 * lntrx-permit - secret redaction on tool results
 *
 * Instead of blocking writes (the old guard approach), this redacts secrets
 * from tool_results before they reach the context. Coarse patterns are safe
 * here: a false positive just blackens, it doesn't block.
 */

// ---------------------------------------------------------------------------
// Secret patterns (from lntrx-guard, plus the broad AWS 40-char pattern)
// ---------------------------------------------------------------------------

interface SecretPattern {
  name: string;
  pattern: RegExp;
}

const SECRETS: SecretPattern[] = [
  { name: "OpenAI Key",       pattern: /sk-[A-Za-z0-9]{32,}/g },
  { name: "GitHub Token",     pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: "AWS Key",          pattern: /AKIA[0-9A-Z]{16}/g },
  { name: "AWS Secret",       pattern: /[A-Za-z0-9/+=]{40}/g },
  { name: "Google API Key",   pattern: /AIza[0-9A-Za-z\-_]{35}/g },
  { name: "JWT Token",        pattern: /eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+/=]*/g },
  { name: "Private Key",      pattern: /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----[\s\S]*?-----END \1 PRIVATE KEY-----/g },
  { name: "Slack Token",      pattern: /xox[baprs]-[0-9A-Za-z\-]{10,}/g },
  { name: "Stripe Key",       pattern: /[sr]k_live_[0-9a-zA-Z]{24,}/g },
];

// ---------------------------------------------------------------------------
// Redact a single text string
// ---------------------------------------------------------------------------

export function redact(text: string): string {
  let result = text;
  for (const s of SECRETS) {
    result = result.replace(s.pattern, `[REDACTED:${s.name}]`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Redact tool result content (handles text and array-of-parts formats)
// ---------------------------------------------------------------------------

export function redactToolResult(content: unknown): unknown {
  if (typeof content === "string") {
    return redact(content);
  }
  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
        return { ...part, text: redact(part.text) };
      }
      return part;
    });
  }
  return content;
}