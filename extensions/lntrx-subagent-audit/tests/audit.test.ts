/**
 * audit.test.ts - the record that makes the next occurrence diagnosable.
 *
 * Run: npx tsx extensions/lntrx-subagent-audit/tests/audit.test.ts
 *
 * Writes into a temporary directory via LNTRX_SUBAGENT_AUDIT_FILE; the real
 * file under ~/.pi/agent is never touched.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "lntrx-subagent-audit-"));
process.env.LNTRX_SUBAGENT_AUDIT_FILE = join(workDir, "audit.jsonl");

const { auditPath, formatAudit, readAudit, readRunMeta, recordAudit } = await import("../src/audit.js");
const { detachedFailureNotice, findFailedRuns, runIdFromMetaName } = await import("../src/runs.js");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

function eq(a: any, b: any) { assert.equal(a, b); }
function ok(v: any, msg?: string) { assert.ok(v, msg); }

// ---------------------------------------------------------------------------
// The audit log
// ---------------------------------------------------------------------------

test("the audit file honours the environment override", () => {
  eq(auditPath(), join(workDir, "audit.jsonl"));
});

test("an empty audit reads as empty rather than throwing", () => {
  assert.deepEqual(readAudit(), []);
});

test("a failure record carries the error text run-history omits", () => {
  recordAudit({
    ts: 1786347745,
    status: "failed",
    agent: "reviewer",
    runId: "4a11f660",
    model: "anthropic/claude-sonnet-4:high",
    attemptedModels: ["anthropic/claude-sonnet-4:high"],
    exit: 1,
    durationMs: 1687,
    error: "No API key found for anthropic.",
    source: "tool_result",
  });
  const entries = readAudit();
  eq(entries.length, 1);
  eq(entries[0]!.error, "No API key found for anthropic.");
  eq(entries[0]!.exit, 1);
  eq(entries[0]!.model, "anthropic/claude-sonnet-4:high");
});

test("entries come back most recent first", () => {
  recordAudit({ ts: 1786347989, status: "blocked", agent: "reviewer", source: "preflight" });
  const entries = readAudit();
  eq(entries.length, 2);
  eq(entries[0]!.ts, 1786347989);
});

test("a long error is truncated but says so", () => {
  recordAudit({ ts: 1, status: "failed", source: "tool_result", error: "x".repeat(9000) });
  const entry = readAudit(1)[0]!;
  ok(entry.error!.length < 9000);
  ok(entry.error!.includes("truncated"));
});

test("a limit is honoured", () => {
  eq(readAudit(1).length, 1);
});

test("a malformed line does not sink the read", () => {
  writeFileSync(auditPath(), `{"broken\n{"ts":2,"status":"failed","source":"x"}\n`);
  const entries = readAudit();
  eq(entries.length, 1);
  eq(entries[0]!.ts, 2);
});

test("the report names the requested model when it differs from the one tried", () => {
  const text = formatAudit([
    {
      ts: 1786347745,
      status: "failed",
      agent: "reviewer",
      requestedModel: "anthropic/claude-sonnet-4",
      model: "openrouter/anthropic/claude-sonnet-4",
      exit: 1,
      error: "No API key found for anthropic.",
      source: "tool_result",
    },
  ]);
  ok(text.includes("requested: anthropic/claude-sonnet-4"));
  ok(text.includes("No API key found for anthropic."));
  ok(text.includes("exit 1"));
});

test("an empty report says so plainly", () => {
  ok(formatAudit([]).includes("No subagent failures"));
});

// ---------------------------------------------------------------------------
// Lifting what pi-subagents already wrote
// ---------------------------------------------------------------------------

test("reads the run metadata pi-subagents leaves behind", () => {
  const repo = join(workDir, "repo");
  mkdirSync(join(repo, ".pi-subagents", "artifacts"), { recursive: true });
  writeFileSync(
    join(repo, ".pi-subagents", "artifacts", "4a11f660_reviewer_0_meta.json"),
    JSON.stringify({
      agent: "reviewer",
      model: "anthropic/claude-sonnet-4:high",
      attemptedModels: ["anthropic/claude-sonnet-4:high"],
      exitCode: 1,
      durationMs: 1687,
      error: "No API key found for anthropic.",
    }),
  );
  const meta = readRunMeta(repo, "4a11f660");
  eq(meta?.exitCode, 1);
  eq(meta?.error, "No API key found for anthropic.");
  eq(meta?.durationMs, 1687);
});

test("a missing artifacts directory yields nothing rather than throwing", () => {
  eq(readRunMeta(join(workDir, "nowhere"), "4a11f660"), undefined);
});

test("an unknown run id yields nothing", () => {
  eq(readRunMeta(join(workDir, "repo"), "deadbeef"), undefined);
});

test("in a parallel run it reads the agent that failed, not a sibling that passed", () => {
  const repo = join(workDir, "parallel");
  const dir = join(repo, ".pi-subagents", "artifacts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "abc123_planner_0_meta.json"),
    JSON.stringify({ agent: "planner", exitCode: 0, model: "deepseek-v4-flash" }),
  );
  writeFileSync(
    join(dir, "abc123_reviewer_1_meta.json"),
    JSON.stringify({ agent: "reviewer", exitCode: 1, model: "anthropic/claude-sonnet-4", error: "No API key found for anthropic." }),
  );
  // Without a name, the failing sibling wins - recording exit 0 for a failed
  // run would defeat the point of the record.
  eq(readRunMeta(repo, "abc123")?.exitCode, 1);
  // With a name, that agent's own record wins.
  eq(readRunMeta(repo, "abc123", "planner")?.exitCode, 0);
  eq(readRunMeta(repo, "abc123", "reviewer")?.agent, "reviewer");
});

// ---------------------------------------------------------------------------
// The detached failures, found per repository rather than machine-wide
// ---------------------------------------------------------------------------

test("a run id is read off the metadata file name", () => {
  eq(runIdFromMetaName("4a11f660_reviewer_0_meta.json"), "4a11f660");
  eq(runIdFromMetaName("4a11f660_reviewer_0_transcript.jsonl"), undefined);
});

test("only failed runs come back, and only from this repository", () => {
  const repo = join(workDir, "sweep");
  const dir = join(repo, ".pi-subagents", "artifacts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "aaa_reviewer_0_meta.json"),
    JSON.stringify({ agent: "reviewer", exitCode: 0, durationMs: 199065 }),
  );
  writeFileSync(
    join(dir, "bbb_reviewer_0_meta.json"),
    JSON.stringify({
      agent: "reviewer",
      exitCode: 1,
      durationMs: 1687,
      model: "anthropic/claude-sonnet-4:high",
      error: "No API key found for anthropic.",
    }),
  );
  const failures = findFailedRuns(repo, 0);
  eq(failures.length, 1);
  eq(failures[0]!.runId, "bbb");
  eq(failures[0]!.exitCode, 1);
  // Another worktree's failures are not this session's business.
  eq(findFailedRuns(join(workDir, "other-worktree"), 0).length, 0);
});

test("runs that finished before the session started stay quiet", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  eq(findFailedRuns(join(workDir, "sweep"), future).length, 0);
});

test("a repository with no artifacts directory yields nothing", () => {
  eq(findFailedRuns(join(workDir, "nowhere"), 0).length, 0);
});

test("the detached notice states the work did not happen and names the error", () => {
  const notice = detachedFailureNotice(findFailedRuns(join(workDir, "sweep"), 0));
  ok(notice.includes("1 subagent run failed"));
  ok(notice.includes("exit 1"));
  ok(notice.includes("No API key found for anthropic."));
  ok(notice.includes("did not happen"));
  ok(notice.includes("/subagent-audit"));
});


console.log(`\n  ${passed} passed, ${failed} failed`);
rmSync(workDir, { recursive: true, force: true });
if (failed > 0) process.exit(1);
