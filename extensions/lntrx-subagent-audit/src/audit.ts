/**
 * audit.ts - a subagent run record you can diagnose from.
 *
 * `~/.pi/agent/run-history.jsonl` carries `agent`, `taskHash`, `status`,
 * `duration` and an exit code. That is enough to count failures and not enough
 * to explain one: finding out why four reviewers died on 2026-08-10 meant
 * reading four `.pi-subagents/artifacts/*_meta.json` files that nobody would
 * think to look for, in four different worktrees.
 *
 * run-history belongs to pi-subagents and is rewritten by it, so this is a
 * second file rather than an edit to that one: `~/.pi/agent/subagent-audit.jsonl`,
 * carrying the model that was asked for, the model that was tried, the exit
 * code and the error text itself.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Keep an entry diagnosable without letting one stack trace fill the file. */
const MAX_ERROR_CHARS = 4000;
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export type AuditStatus = "failed" | "blocked" | "rewritten";

export interface AuditEntry {
  ts: number;
  status: AuditStatus;
  agent?: string;
  runId?: string;
  cwd?: string;
  /** What the caller asked for. */
  requestedModel?: string;
  /** What the child was actually launched with. */
  model?: string;
  attemptedModels?: string[];
  exit?: number;
  durationMs?: number;
  /** The reason, in full. This is the field run-history is missing. */
  error?: string;
  /** Where the record came from: the tool result, the preflight, run-history. */
  source: string;
}

export function auditPath(): string {
  const override = process.env.LNTRX_SUBAGENT_AUDIT_FILE;
  if (override) return override;
  return join(homedir(), ".pi", "agent", "subagent-audit.jsonl");
}

function truncate(value: string): string {
  if (value.length <= MAX_ERROR_CHARS) return value;
  return `${value.slice(0, MAX_ERROR_CHARS)}\n[truncated, ${value.length - MAX_ERROR_CHARS} chars omitted]`;
}

/** Append one record. Never throws: an audit must not take a session down. */
export function recordAudit(entry: AuditEntry): void {
  try {
    const path = auditPath();
    mkdirSync(dirname(path), { recursive: true, mode: PRIVATE_DIR_MODE });
    const normalized: AuditEntry = {
      ...entry,
      ...(entry.error ? { error: truncate(entry.error) } : {}),
    };
    appendFileSync(path, `${JSON.stringify(normalized)}\n`, {
      encoding: "utf-8",
      mode: PRIVATE_FILE_MODE,
    });
  } catch {
    // Best effort, exactly like pi-subagents' own history writer.
  }
}

/** Most recent entries first. */
export function readAudit(limit = 20): AuditEntry[] {
  const path = auditPath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return [];
  }
  const entries: AuditEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as AuditEntry);
    } catch {
      // A half-written line is not worth failing the report over.
    }
  }
  return entries.reverse().slice(0, limit);
}

/** The subset of a pi-subagents run metadata file worth keeping. */
export interface RunMeta {
  agent?: string;
  model?: string;
  attemptedModels?: string[];
  exitCode?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Read what pi-subagents already wrote about a run.
 *
 * It records everything needed to diagnose a failure in
 * `<cwd>/.pi-subagents/artifacts/<runId>_<agent>_<index>_meta.json` - the file
 * that finally explained the 2026-08-10 failures. Nothing here re-derives that;
 * it is lifted into the audit line so the next occurrence needs one file, not
 * two.
 */
export function readRunMeta(cwd: string, runId: string): RunMeta | undefined {
  if (!cwd || !runId) return undefined;
  const dir = join(cwd, ".pi-subagents", "artifacts");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return undefined;
  }
  const match = names.find(
    (name) => name.startsWith(`${runId}_`) && name.endsWith("_meta.json"),
  );
  if (!match) return undefined;
  try {
    const raw = JSON.parse(readFileSync(join(dir, match), "utf-8")) as Record<string, unknown>;
    return {
      ...(typeof raw.agent === "string" ? { agent: raw.agent } : {}),
      ...(typeof raw.model === "string" ? { model: raw.model } : {}),
      ...(Array.isArray(raw.attemptedModels)
        ? { attemptedModels: raw.attemptedModels.filter((m): m is string => typeof m === "string") }
        : {}),
      ...(typeof raw.exitCode === "number" ? { exitCode: raw.exitCode } : {}),
      ...(typeof raw.durationMs === "number" ? { durationMs: raw.durationMs } : {}),
      ...(typeof raw.error === "string" ? { error: raw.error } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Format the audit for `/subagent-audit`. */
export function formatAudit(entries: AuditEntry[]): string {
  if (entries.length === 0) return "No subagent failures recorded.";
  const lines: string[] = [];
  for (const entry of entries) {
    const when = new Date(entry.ts * 1000).toISOString().replace("T", " ").slice(0, 19);
    const exit = entry.exit !== undefined ? ` exit ${entry.exit}` : "";
    const model = entry.model ?? entry.requestedModel ?? "?";
    lines.push(`${when}  ${entry.status.toUpperCase()}  ${entry.agent ?? "?"}  ${model}${exit}`);
    if (entry.requestedModel && entry.model && entry.requestedModel !== entry.model) {
      lines.push(`    requested: ${entry.requestedModel}`);
    }
    if (entry.error) {
      for (const line of entry.error.split("\n").slice(0, 6)) {
        if (line.trim()) lines.push(`    ${line.trim()}`);
      }
    }
  }
  lines.push("", `Full records: ${auditPath()}`);
  return lines.join("\n");
}
