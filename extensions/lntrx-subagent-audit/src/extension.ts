/**
 * lntrx-subagent-audit - a failed subagent stops being invisible.
 *
 * The problem it answers, from a real round of eleven agents on 2026-08-10:
 * fifteen reviewer runs, four of them dead, and every calling agent reported
 * success. A quarter of the reviews that day did not exist and nothing in the
 * agents' output said so. The failures were found by hand, afterwards, by
 * reading `run-history.jsonl` against what the agents had claimed.
 *
 * Three things had to be true at once for that to happen, and there is one
 * guard here for each:
 *
 *   preflight  The model argument was `anthropic/claude-sonnet-4` - an
 *              OpenRouter model id whose leading segment was read as a
 *              provider, on a machine with no anthropic credentials. The child
 *              died in under a second, before any model call. See model-ref.ts.
 *
 *   gate       The `subagent` tool reports a dead run in its text and still
 *              returns `isError: false`, so nothing forced the caller to
 *              address it. See failure.ts.
 *
 *   sweep      Three of the four runs were detached; their failure arrived as a
 *              display-only notification the caller had no obligation to read.
 *              See runs.ts.
 *
 * And one thing was missing afterwards: run-history records `status: "error"`
 * and nothing else, so a failure could be counted but not explained. See
 * audit.ts.
 *
 * Retries are deliberately absent. The cause here was a misconfiguration, and a
 * retry would have spent four more runs on it and hidden it just as well.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { get, getProject } from "../../../lib/config";
import { formatAudit, readAudit, readRunMeta, recordAudit } from "./audit.js";
import { contentToText, detectFailure, failureNotice } from "./failure.js";
import { detachedFailureNotice, findFailedRuns } from "./runs.js";
import {
  applyModelRewrite,
  collectModelRefs,
  verifyModelRef,
  type ModelEntry,
} from "./model-ref.js";

const SUBAGENT_TOOL = "subagent";

const KEY_ENABLED = "lntrx-subagent-audit.enabled";
const KEY_PREFLIGHT = "lntrx-subagent-audit.preflight";
const KEY_GATE = "lntrx-subagent-audit.gate";
const KEY_SWEEP = "lntrx-subagent-audit.sweep";

/** Project overrides global overrides default, the order every extension here uses. */
function isEnabled(cwd: string, key: string): boolean {
  const project = getProject(cwd, key);
  if (project !== undefined) return !!project;
  const global = get(key);
  if (global !== undefined) return !!global;
  return true;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function availableModels(ctx: any): ModelEntry[] {
  try {
    const models = ctx?.modelRegistry?.getAvailable?.();
    if (!Array.isArray(models)) return [];
    return models
      .filter((m: any) => typeof m?.provider === "string" && typeof m?.id === "string")
      .map((m: any) => ({ provider: m.provider as string, id: m.id as string }));
  } catch {
    // No registry, no opinion - the call goes through unchanged.
    return [];
  }
}

function runIdOf(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const record = details as Record<string, unknown>;
  if (typeof record.runId === "string") return record.runId;
  const results = record.results;
  if (Array.isArray(results)) {
    for (const result of results) {
      const id = (result as Record<string, unknown> | undefined)?.runId;
      if (typeof id === "string") return id;
    }
  }
  return undefined;
}

function agentOf(input: unknown, meta: { agent?: string } | undefined): string | undefined {
  if (meta?.agent) return meta.agent;
  if (input && typeof input === "object") {
    const agent = (input as Record<string, unknown>).agent;
    if (typeof agent === "string") return agent;
  }
  return undefined;
}

export default function (pi: ExtensionAPI) {
  /**
   * Runs already accounted for: reported by the gate below, or already
   * announced by the sweep. Announcing one twice would be noise; announcing an
   * attached failure as "never handed to you" would be untrue.
   */
  const settledRuns = new Set<string>();
  /** Runs that finished before this session began are none of its business. */
  let sessionStartedAt = Math.floor(Date.now() / 1000);

  pi.on("session_start", async (_event, ctx) => {
    sessionStartedAt = Math.floor(Date.now() / 1000);
    settledRuns.clear();
    void ctx;
  });

  // ---- preflight: refuse or correct a model the child cannot reach ----------
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== SUBAGENT_TOOL) return;
    if (!isEnabled(ctx.cwd, KEY_ENABLED) || !isEnabled(ctx.cwd, KEY_PREFLIGHT)) return;

    const available = availableModels(ctx);
    if (available.length === 0) return;
    const preferred = (ctx as any)?.model?.provider as string | undefined;

    for (const ref of collectModelRefs(event.input)) {
      const verdict = verifyModelRef(ref, available, preferred);

      if (verdict.kind === "rewrite") {
        if (!applyModelRewrite(event.input, verdict.from, verdict.to)) continue;
        recordAudit({
          ts: now(),
          status: "rewritten",
          cwd: ctx.cwd,
          requestedModel: verdict.from,
          model: verdict.to,
          source: "preflight",
          error: `"${verdict.from}" reads as provider "${verdict.from.split("/")[0]}" to the child CLI, which has no credentials here. It is a model id of provider "${verdict.provider}"; rewritten to "${verdict.to}".`,
        });
        ctx.ui.notify(
          `subagent model "${verdict.from}" rewritten to "${verdict.to}" (it is a ${verdict.provider} model id, not a provider).`,
          "warning",
        );
        continue;
      }

      if (verdict.kind === "unavailable") {
        const advice =
          verdict.suggestions.length > 0
            ? `Use one of these instead: ${verdict.suggestions.join(", ")} - or drop the model argument to take the configured default.`
            : "No configured provider offers a model by that name. Drop the model argument to take the configured default.";
        const reason =
          `Subagent not started: model "${verdict.raw}" is not reachable. Its leading segment "${verdict.provider}" ` +
          `is not a provider this machine has credentials for, and no available model carries that id. ${advice} ` +
          `Starting it anyway would fail in under two seconds with "No API key found for ${verdict.provider}", ` +
          `and the run would not happen.`;
        recordAudit({
          ts: now(),
          status: "blocked",
          cwd: ctx.cwd,
          agent: agentOf(event.input, undefined),
          requestedModel: verdict.raw,
          source: "preflight",
          error: reason,
        });
        return { block: true, reason };
      }
    }
  });

  // ---- gate: a failed run comes back as a tool error ------------------------
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== SUBAGENT_TOOL) return;
    if (!isEnabled(ctx.cwd, KEY_ENABLED)) return;

    const signal = detectFailure(event.content);
    if (!signal.failed) return;

    const runId = runIdOf(event.details);
    const meta = runId ? readRunMeta(ctx.cwd, runId, agentOf(event.input, undefined)) : undefined;
    // The caller has been told about this one. The sweep must not tell them
    // again, least of all that they were never told.
    if (runId) settledRuns.add(runId);
    recordAudit({
      ts: now(),
      status: "failed",
      cwd: ctx.cwd,
      source: "tool_result",
      ...(runId ? { runId } : {}),
      ...(agentOf(event.input, meta) ? { agent: agentOf(event.input, meta)! } : {}),
      ...(meta?.model ? { model: meta.model } : {}),
      ...(meta?.attemptedModels ? { attemptedModels: meta.attemptedModels } : {}),
      ...(meta?.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
      ...(meta?.exitCode !== undefined
        ? { exit: meta.exitCode }
        : signal.exit !== undefined
          ? { exit: signal.exit }
          : {}),
      error: meta?.error ?? contentToText(event.content),
    });

    // Mark the run as failed in a way the caller cannot narrate around. Runs
    // already flagged as errors are left alone.
    if (!isEnabled(ctx.cwd, KEY_GATE) || event.isError) return;
    const existing = Array.isArray(event.content) ? event.content : [];
    return {
      isError: true,
      content: [{ type: "text", text: failureNotice(signal) }, ...existing],
    };
  });

  // ---- sweep: detached failures that never became a tool result -------------
  pi.on("agent_settled", async (_event, ctx) => {
    if (!isEnabled(ctx.cwd, KEY_ENABLED) || !isEnabled(ctx.cwd, KEY_SWEEP)) return;

    const failures = findFailedRuns(ctx.cwd, sessionStartedAt).filter(
      (failure) => !settledRuns.has(failure.runId),
    );
    if (failures.length === 0) return;

    for (const failure of failures) {
      settledRuns.add(failure.runId);
      recordAudit({
        ts: failure.ts,
        status: "failed",
        cwd: ctx.cwd,
        runId: failure.runId,
        source: "artifacts",
        ...(failure.agent ? { agent: failure.agent } : {}),
        ...(failure.model ? { model: failure.model } : {}),
        ...(failure.attemptedModels ? { attemptedModels: failure.attemptedModels } : {}),
        ...(failure.exitCode !== undefined ? { exit: failure.exitCode } : {}),
        ...(failure.durationMs !== undefined ? { durationMs: failure.durationMs } : {}),
        ...(failure.error ? { error: failure.error } : {}),
      });
    }

    try {
      pi.sendMessage(
        {
          customType: "lntrx-subagent-audit",
          content: detachedFailureNotice(failures),
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    } catch {
      // A session being torn down mid-delivery must not print the same
      // "Extension error" banner this change exists to remove. The audit line
      // above is already written either way.
    }
  });

  pi.registerCommand("subagent-audit", {
    description: "Show recent subagent failures with their error text",
    handler: async (args, ctx) => {
      const limit = Number.parseInt(args.trim(), 10);
      const entries = readAudit(Number.isFinite(limit) && limit > 0 ? limit : 10);
      ctx.ui.notify(formatAudit(entries), entries.length > 0 ? "warning" : "info");
    },
  });
}
