/**
 * audit.test.ts - the record that makes the next occurrence diagnosable.
 *
 * Run: npx tsx extensions/lntrx-subagent-audit/tests/audit.test.ts
 *
 * Writes into a temporary directory via LNTRX_SUBAGENT_AUDIT_FILE and
 * LNTRX_SUBAGENT_HISTORY_FILE; the real files under ~/.pi/agent are never
 * touched.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "lntrx-subagent-audit-"));
process.env.LNTRX_SUBAGENT_AUDIT_FILE = join(workDir, "audit.jsonl");
process.env.LNTRX_SUBAGENT_HISTORY_FILE = join(workDir, "run-history.jsonl");

const { auditPath, formatAudit, readAudit, readRunMeta, recordAudit } = await import("../src/audit.js");
const { detachedFailureNotice, newFailures, parseHistory, readHistory, seedSeen } = await import(
  "../src/history.js"
);

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

// ---------------------------------------------------------------------------
// The detached failures, straight from run-history.jsonl
// ---------------------------------------------------------------------------

const REAL_HISTORY = [
  '{"agent":"reviewer","task":"[redacted]","taskHash":"9cde","ts":1786347480,"status":"ok","duration":199065}',
  '{"agent":"reviewer","task":"[redacted]","taskHash":"1ddf","ts":1786347745,"status":"error","duration":1687,"exit":1}',
  '{"agent":"reviewer","task":"[redacted]","taskHash":"13e4","ts":1786347852,"status":"error","duration":119939,"exit":143}',
].join("\n");

test("parses the real history format", () => {
  const entries = parseHistory(REAL_HISTORY);
  eq(entries.length, 3);
  eq(entries[1]!.exit, 1);
});

test("skips lines that are not run entries", () => {
  eq(parseHistory('{"nope":1}\n{"agent":"x","ts":1,"status":"weird","duration":0}\n').length, 0);
});

test("only the failures come back, and only once", () => {
  const entries = parseHistory(REAL_HISTORY);
  const seen = new Set<string>();
  const first = newFailures(entries, seen);
  eq(first.length, 2);
  eq(newFailures(entries, seen).length, 0);
});

test("failures already on disk at session start stay quiet", () => {
  const entries = parseHistory(REAL_HISTORY);
  eq(newFailures(entries, seedSeen(entries)).length, 0);
});

test("a failure appended after session start is reported", () => {
  const entries = parseHistory(REAL_HISTORY);
  const seen = seedSeen(entries);
  const later = parseHistory(
    `${REAL_HISTORY}\n{"agent":"reviewer","task":"[redacted]","taskHash":"d63e","ts":1786347989,"status":"error","duration":786,"exit":1}`,
  );
  const fresh = newFailures(later, seen);
  eq(fresh.length, 1);
  eq(fresh[0]!.duration, 786);
});

test("history reads through the environment override", () => {
  writeFileSync(process.env.LNTRX_SUBAGENT_HISTORY_FILE!, REAL_HISTORY);
  eq(readHistory().length, 3);
});

test("a missing history file reads as empty", () => {
  rmSync(process.env.LNTRX_SUBAGENT_HISTORY_FILE!, { force: true });
  eq(readHistory().length, 0);
});

test("the detached notice states the work did not happen", () => {
  const notice = detachedFailureNotice(parseHistory(REAL_HISTORY).filter((e) => e.status === "error"));
  ok(notice.includes("2 subagent runs failed"));
  ok(notice.includes("exit 143"));
  ok(notice.includes("did not happen"));
  ok(notice.includes("/subagent-audit"));
});

console.log(`\n  ${passed} passed, ${failed} failed`);
rmSync(workDir, { recursive: true, force: true });
if (failed > 0) process.exit(1);
