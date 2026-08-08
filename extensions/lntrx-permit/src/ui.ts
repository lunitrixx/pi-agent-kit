/**
 * lntrx-permit - UI: confirmation prompts and session approvals
 *
 * Session approvals are persisted via appendEntry so --resume brings them back.
 * Pattern-based: approving "git push *--force*" remembers the rule, not the
 * specific command, so subsequent force pushes on different branches also pass.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const APPROVAL_CUSTOM_TYPE = "permit-approvals";

// ---------------------------------------------------------------------------
// Session approvals
// ---------------------------------------------------------------------------

let sessionApprovals = new Map<string, boolean>();

export function loadApprovals(data: unknown): void {
  if (Array.isArray(data)) {
    for (const p of data) {
      if (typeof p === "string") sessionApprovals.set(p, true);
    }
  }
}

export function getApprovalsPatterns(): string[] {
  return [...sessionApprovals.keys()];
}

export function clearApprovals(): void {
  sessionApprovals.clear();
}

export function isApproved(pattern: string): boolean {
  return sessionApprovals.has(pattern);
}

export function addApproval(pattern: string, pi: ExtensionAPI): void {
  sessionApprovals.set(pattern, true);
  // Persist for --resume
  pi.appendEntry(APPROVAL_CUSTOM_TYPE, getApprovalsPatterns());
}

// ---------------------------------------------------------------------------
// Prompt helper — 3-way: once / session / deny
// ---------------------------------------------------------------------------

export type PermitChoice = "once" | "session" | "deny";

export interface PermitPromptResult {
  choice: PermitChoice;
}

/**
 * Ask the user for permission. Returns the choice or null if the dialog
 * was cancelled / unavailable.
 */
export async function promptPermit(
  ctx: { ui: ExtensionAPI["ui"] },
  label: string,
  matchedPattern: string,
  detail?: string,
): Promise<PermitChoice | null> {
  const body = `${label}

Pattern: ${matchedPattern}
${detail ? `\n${detail}` : ""}

Allow this action?`;

  // Use select for 3-way choice
  const choice = await ctx.ui.select(
    `🛡️ Permit: ${label}`,
    [
      "Once — allow this time",
      "Session — allow until restart",
      "Deny — block this action",
    ],
  );

  if (!choice) return null;
  if (choice.includes("Session")) return "session";
  if (choice.includes("Deny")) return "deny";
  return "once";
}

// ---------------------------------------------------------------------------
// YOLO warning
// ---------------------------------------------------------------------------

export function yoloWarning(): string {
  return "🛡️ Permit: --yolo mode active — ALL permission checks are bypassed.";
}