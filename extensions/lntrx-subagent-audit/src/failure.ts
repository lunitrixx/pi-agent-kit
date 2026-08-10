/**
 * failure.ts - recognise a failed subagent run in what the tool hands back.
 *
 * The `subagent` tool reports a dead run in its text and still returns
 * `isError: false`. In the four failures of 2026-08-10 the status result read
 *
 *   1. reviewer failed, exit 1, acceptance: rejected, error: ...
 *
 * with `"isError": false` on the same message, and the calling agent narrated
 * around it. The patterns below are the shapes that text takes.
 *
 * They are deliberately anchored and specific. A review that *reports* failing
 * tests - "3 tests failed", "the build failed" - is a successful review, and
 * marking it as a tool error would train the caller to ignore the flag.
 */

export interface FailureSignal {
  failed: boolean;
  /** The line that gave it away, for the audit record. */
  marker?: string;
  /** Child process exit code, when the text names one. */
  exit?: number;
}

interface Pattern {
  regex: RegExp;
  exitGroup?: number;
}

const PATTERNS: Pattern[] = [
  // Workflow step failure, as delivered by the async completion notice.
  { regex: /^Run '[^']*' failed:/m },
  // Per-step line of `subagent({ action: "status" })`.
  { regex: /^\s*\d+\.\s+\S+ failed, exit (-?\d+)/m, exitGroup: 1 },
  // Single-run summary when the child died before writing anything.
  { regex: /^Subagent run failed before producing output\./m },
  // Async notification headline.
  { regex: /^Background task failed:/m },
  // Startup retries exhausted.
  { regex: /Subagent failed to start after \d+ attempts/ },
  // Model attempts exhausted.
  { regex: /^All model attempts failed/m },
];

/** Flatten the `content` of a tool result into searchable text. */
export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block && typeof block === "object" && typeof (block as any).text === "string") {
        return (block as any).text as string;
      }
      return "";
    })
    .join("\n");
}

/**
 * Drop fenced code blocks and blockquotes.
 *
 * A review that quotes one of the markers - and a review of *this* extension
 * certainly will - would otherwise be flagged as the failure it is describing.
 * The harness never wraps its own status lines in a fence, so nothing real is
 * lost by ignoring what is inside one.
 */
export function stripQuotedBlocks(text: string): string {
  const lines: string[] = [];
  let fence: string | undefined;
  for (const line of text.split("\n")) {
    const opener = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (opener && line.trimStart().startsWith(fence)) fence = undefined;
      continue;
    }
    if (opener) {
      fence = opener[1]!.slice(0, 3);
      continue;
    }
    if (/^\s*>/.test(line)) continue;
    lines.push(line);
  }
  return lines.join("\n");
}

export function detectFailure(content: unknown): FailureSignal {
  const text = stripQuotedBlocks(contentToText(content));
  if (!text.trim()) return { failed: false };

  for (const pattern of PATTERNS) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    const exit =
      pattern.exitGroup !== undefined ? Number(match[pattern.exitGroup]) : undefined;
    return {
      failed: true,
      marker: match[0].trim(),
      ...(exit !== undefined && Number.isFinite(exit) ? { exit } : {}),
    };
  }

  return { failed: false };
}

/**
 * The notice prepended to a failed subagent result. It is written at the
 * caller, in the imperative, because the failure mode being fixed is a caller
 * that read "failed" and reported success anyway.
 */
export function failureNotice(signal: FailureSignal): string {
  const exit = signal.exit !== undefined ? ` (exit ${signal.exit})` : "";
  return [
    `SUBAGENT RUN FAILED${exit} - THIS TOOL CALL DID NOT PRODUCE A RESULT.`,
    "",
    `Detected: ${signal.marker ?? "run reported as failed"}`,
    "",
    "The subagent did not do its work. Do not treat anything below as its output,",
    "and do not report the task as reviewed, planned, or built by it.",
    "Either fix the cause and run it again, or say plainly in your report that the",
    "run failed and what the error was. Run `/subagent-audit` for the full error.",
  ].join("\n");
}
