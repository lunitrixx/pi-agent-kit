/**
 * history.ts - catching the failure that never reaches a tool result.
 *
 * The three sub-two-second failures were *detached* runs. Their failure came
 * back as a `subagent-notify` custom message while the calling agent was
 * already running `git status`, and a display-only notice is not something an
 * agent has to answer. That is the whole reason the reviews were reported as
 * done.
 *
 * So a detached failure has to be found somewhere other than the tool result.
 * pi-subagents appends every finished run to `~/.pi/agent/run-history.jsonl`,
 * including the ones it never handed back, and that file is the one place a
 * detached failure is certain to appear.
 *
 * It is rewritten in place by its owner (sanitised, rotated), so byte offsets
 * are useless here. Entries are identified by content instead.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HistoryEntry {
  agent: string;
  taskHash?: string;
  ts: number;
  status: "ok" | "error";
  duration: number;
  exit?: number;
}

export function historyPath(): string {
  const override = process.env.LNTRX_SUBAGENT_HISTORY_FILE;
  if (override) return override;
  return join(homedir(), ".pi", "agent", "run-history.jsonl");
}

export function parseHistory(raw: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed) as Partial<HistoryEntry>;
      if (typeof value.agent !== "string" || typeof value.ts !== "number") continue;
      if (value.status !== "ok" && value.status !== "error") continue;
      entries.push({
        agent: value.agent,
        ts: value.ts,
        status: value.status,
        duration: typeof value.duration === "number" ? value.duration : 0,
        ...(typeof value.taskHash === "string" ? { taskHash: value.taskHash } : {}),
        ...(typeof value.exit === "number" ? { exit: value.exit } : {}),
      });
    } catch {
      // A truncated line is not worth failing the sweep over.
    }
  }
  return entries;
}

export function readHistory(): HistoryEntry[] {
  const path = historyPath();
  if (!existsSync(path)) return [];
  try {
    return parseHistory(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

/** Identity of a run, stable across the rewrites its owner performs. */
export function historyKey(entry: HistoryEntry): string {
  return `${entry.agent}|${entry.ts}|${entry.taskHash ?? ""}|${entry.duration}`;
}

/**
 * Failed runs that appeared since the last sweep.
 *
 * `seen` is mutated, so an already-reported failure is never reported twice -
 * which also stops the follow-up message this feeds from triggering a turn that
 * finds the same failure again.
 */
export function newFailures(entries: HistoryEntry[], seen: Set<string>): HistoryEntry[] {
  const fresh: HistoryEntry[] = [];
  for (const entry of entries) {
    const key = historyKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    if (entry.status === "error") fresh.push(entry);
  }
  return fresh;
}

/** Seed `seen` with everything already on disk, so a session only reports its own runs. */
export function seedSeen(entries: HistoryEntry[]): Set<string> {
  return new Set(entries.map(historyKey));
}

/** The message a detached failure is announced with, addressed to the caller. */
export function detachedFailureNotice(failures: HistoryEntry[]): string {
  const lines = [
    `${failures.length} subagent run${failures.length === 1 ? "" : "s"} failed while you were working, and the failure was never handed to you as a tool result.`,
    "",
  ];
  for (const failure of failures) {
    const exit = failure.exit !== undefined ? `, exit ${failure.exit}` : "";
    lines.push(`- ${failure.agent}: failed after ${failure.duration}ms${exit}`);
  }
  lines.push(
    "",
    "That work did not happen. Do not report it as done by a subagent.",
    "Run `/subagent-audit` for the error text, fix the cause and run it again, or",
    "state in your report that the run failed and why.",
  );
  return lines.join("\n");
}
