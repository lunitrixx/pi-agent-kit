/**
 * runs.ts - finding the failure that never reaches a tool result.
 *
 * The three sub-two-second failures were *detached* runs. Their failure came
 * back as a `subagent-notify` custom message while the calling agent was
 * already running `git status`, and a display-only notice is not something an
 * agent has to answer. That is the whole reason the reviews were reported as
 * done.
 *
 * So a detached failure has to be found somewhere other than the tool result.
 * The obvious candidate, `~/.pi/agent/run-history.jsonl`, is the wrong one:
 * it is machine-global and its entries carry no cwd, no run id and no session,
 * so with eleven worktree agents in parallel - the situation this exists for -
 * every session would be handed every other session's failures, and would be
 * told to answer for work it never started.
 *
 * `<cwd>/.pi-subagents/artifacts/<runId>_<agent>_<n>_meta.json` is the right
 * one. pi-subagents writes it per repository, for detached runs as much as for
 * attached ones, and it carries the run id, the agent, the model, the exit code
 * and the error text. All four failures of 2026-08-10 left one.
 *
 * Only *foreground* runs are recorded this way, detached or not. A genuinely
 * backgrounded run writes no such file and is not visible here.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readRunMeta, type RunMeta } from "./audit.js";

export interface FailedRun extends RunMeta {
  runId: string;
  /** Modification time of the metadata file, in epoch seconds. */
  ts: number;
}

export function artifactsDir(cwd: string): string {
  return join(cwd, ".pi-subagents", "artifacts");
}

/** `<runId>_<agent>_<index>_meta.json` - the run id is the leading segment. */
export function runIdFromMetaName(name: string): string | undefined {
  if (!name.endsWith("_meta.json")) return undefined;
  const runId = name.slice(0, name.indexOf("_"));
  return runId.length > 0 ? runId : undefined;
}

/**
 * Every run in this repository whose child exited non-zero.
 *
 * `since` drops runs that finished before this session started, so a session
 * only ever answers for its own work.
 */
export function findFailedRuns(cwd: string, since: number): FailedRun[] {
  const dir = artifactsDir(cwd);
  if (!existsSync(dir)) return [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  const failures: FailedRun[] = [];
  const seenIds = new Set<string>();
  for (const name of names) {
    const runId = runIdFromMetaName(name);
    if (!runId || seenIds.has(runId)) continue;
    let ts: number;
    try {
      ts = Math.floor(statSync(join(dir, name)).mtimeMs / 1000);
    } catch {
      continue;
    }
    if (ts < since) continue;
    const meta = readRunMeta(cwd, runId);
    if (!meta || meta.exitCode === undefined || meta.exitCode === 0) continue;
    seenIds.add(runId);
    failures.push({ ...meta, runId, ts });
  }
  return failures.sort((a, b) => a.ts - b.ts);
}

/**
 * The message a detached failure is announced with, addressed to the caller.
 *
 * Only reached for runs the tool result did not already report - an attached
 * failure is caught by the gate, and saying "you were never told" about one
 * would be both a duplicate and a lie.
 */
export function detachedFailureNotice(failures: FailedRun[]): string {
  const lines = [
    `${failures.length} subagent run${failures.length === 1 ? "" : "s"} failed in this repository, and the failure was never handed to you as a tool result.`,
    "",
  ];
  for (const failure of failures) {
    const exit = failure.exitCode !== undefined ? `, exit ${failure.exitCode}` : "";
    const model = failure.model ? ` on ${failure.model}` : "";
    const first = failure.error?.split("\n").find((line) => line.trim().length > 0);
    lines.push(`- ${failure.agent ?? "subagent"} (${failure.runId})${model}${exit}`);
    if (first) lines.push(`  ${first.trim()}`);
  }
  lines.push(
    "",
    "That work did not happen. Do not report it as done by a subagent.",
    "Run `/subagent-audit` for the full error text, then either fix the cause and",
    "run it again, or state in your report that the run failed and why.",
  );
  return lines.join("\n");
}
