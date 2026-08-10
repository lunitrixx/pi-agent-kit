/**
 * extension.test.ts - the failure path, end to end, with a broken subagent.
 *
 * Run: npx tsx extensions/lntrx-subagent-audit/tests/extension.test.ts
 *
 * Drives the extension through a stub of the harness and replays the three ways
 * a reviewer died on 2026-08-10, asking each time what the calling agent is
 * handed. The point of the exercise is the last assertion in each block: the
 * caller cannot come away from any of them believing a review happened.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "lntrx-subagent-ext-"));
const historyFile = join(workDir, "run-history.jsonl");
process.env.LNTRX_SUBAGENT_AUDIT_FILE = join(workDir, "audit.jsonl");
process.env.LNTRX_SUBAGENT_HISTORY_FILE = historyFile;

const createExtension = (await import("../src/extension.js")).default;
const { readAudit } = await import("../src/audit.js");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✅ ${name}`); })
    .catch((e: any) => { failed++; console.log(`  ❌ ${name}: ${e.message}`); });
}

function eq(a: any, b: any) { assert.equal(a, b); }
function ok(v: any, msg?: string) { assert.ok(v, msg); }

// ---------------------------------------------------------------------------
// A harness stub: only what the extension actually touches.
// ---------------------------------------------------------------------------

interface Sent { content: string; options: any }

function buildHarness() {
  const handlers = new Map<string, Function[]>();
  const sent: Sent[] = [];
  const notified: string[] = [];

  const pi = {
    on(event: string, handler: Function) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    sendMessage(message: any, options: any) {
      sent.push({ content: message.content, options });
    },
    registerCommand() {},
  };

  const ctx = {
    cwd: workDir,
    // This machine on 2026-08-10: OpenRouter credentials and nothing else.
    model: { provider: "openrouter", id: "deepseek/deepseek-v4-pro" },
    modelRegistry: {
      getAvailable: () => [
        { provider: "openrouter", id: "anthropic/claude-sonnet-4" },
        { provider: "openrouter", id: "deepseek/deepseek-v4-pro" },
      ],
    },
    ui: { notify: (text: string) => notified.push(text) },
  };

  createExtension(pi as any);

  const fire = async (event: string, payload: any) => {
    let last: any;
    for (const handler of handlers.get(event) ?? []) last = await handler(payload, ctx);
    return last;
  };

  return { fire, sent, notified };
}

// ---------------------------------------------------------------------------
// 1. The broken model argument, refused before a subagent is spawned
// ---------------------------------------------------------------------------

await test("a model no provider here can reach blocks the call, with the reason", async () => {
  const h = buildHarness();
  await h.fire("session_start", {});
  const verdict = await h.fire("tool_call", {
    toolName: "subagent",
    input: { agent: "reviewer", task: "review the diff", model: "anthropic/claude-opus-9" },
  });
  eq(verdict?.block, true);
  ok(verdict.reason.includes("anthropic"), verdict.reason);
  ok(verdict.reason.includes("not reachable"), verdict.reason);
  ok(verdict.reason.includes("No API key found for anthropic"), verdict.reason);
});

await test("the block is written to the audit as well", async () => {
  const entry = readAudit(1)[0]!;
  eq(entry.status, "blocked");
  eq(entry.requestedModel, "anthropic/claude-opus-9");
  ok(entry.error!.length > 0);
});

await test("when a reachable model has the same name, the block names it", async () => {
  const h = buildHarness();
  await h.fire("session_start", {});
  const verdict = await h.fire("tool_call", {
    toolName: "subagent",
    input: { agent: "reviewer", task: "review", model: "mistral/claude-sonnet-4" },
  });
  eq(verdict?.block, true);
  ok(verdict.reason.includes("openrouter/anthropic/claude-sonnet-4"), verdict.reason);
});

// ---------------------------------------------------------------------------
// 2. The argument that actually killed the four runs, corrected
// ---------------------------------------------------------------------------

await test("anthropic/claude-sonnet-4 in a workflowScript is corrected, not blocked", async () => {
  const h = buildHarness();
  await h.fire("session_start", {});
  const input = {
    workflowScript:
      "return runs.run('review', { agent: 'reviewer', task: `x`, context: 'fresh', model: 'anthropic/claude-sonnet-4' });",
  };
  const verdict = await h.fire("tool_call", { toolName: "subagent", input });
  eq(verdict, undefined);
  ok(
    input.workflowScript.includes("model: 'openrouter/anthropic/claude-sonnet-4'"),
    input.workflowScript,
  );
  ok(h.notified.some((n) => n.includes("openrouter/anthropic/claude-sonnet-4")));
});

await test("the model the eleven successful runs used passes through untouched", async () => {
  const h = buildHarness();
  await h.fire("session_start", {});
  const input = { agent: "reviewer", task: "review", model: "deepseek-v4-pro" };
  const verdict = await h.fire("tool_call", { toolName: "subagent", input });
  eq(verdict, undefined);
  eq(input.model, "deepseek-v4-pro");
});

await test("tools other than subagent are ignored", async () => {
  const h = buildHarness();
  const verdict = await h.fire("tool_call", {
    toolName: "bash",
    input: { command: "echo model: 'anthropic/claude-opus-9'" },
  });
  eq(verdict, undefined);
});

// ---------------------------------------------------------------------------
// 3. A failed run that came back as isError:false - the 2026-08-10 shape
// ---------------------------------------------------------------------------

await test("a failed run is turned into a tool error the caller must answer", async () => {
  const h = buildHarness();
  await h.fire("session_start", {});
  const patch = await h.fire("tool_result", {
    toolName: "subagent",
    input: { agent: "reviewer" },
    isError: false,
    details: { runId: "4a11f660", mode: "single", results: [] },
    content: [
      {
        type: "text",
        text: "1. reviewer failed, exit 1, acceptance: rejected, error: No API key found for anthropic.",
      },
    ],
  });
  eq(patch?.isError, true);
  const first = patch.content[0].text as string;
  ok(first.startsWith("SUBAGENT RUN FAILED"), first);
  ok(first.includes("exit 1"), first);
  ok(first.toLowerCase().includes("do not report the task as reviewed"), first);
  // The original text is kept below the notice, not replaced.
  ok(patch.content.length === 2);
});

await test("the failure lands in the audit with its error text", async () => {
  const entry = readAudit(1)[0]!;
  eq(entry.status, "failed");
  eq(entry.runId, "4a11f660");
  eq(entry.exit, 1);
  ok(entry.error!.includes("No API key found for anthropic."));
});

await test("a successful review is left alone", async () => {
  const h = buildHarness();
  await h.fire("session_start", {});
  const patch = await h.fire("tool_result", {
    toolName: "subagent",
    input: { agent: "reviewer" },
    isError: false,
    details: { runId: "829be8b1" },
    content: [{ type: "text", text: "## Findings\n\n- 3 tests failed before this change.\n" }],
  });
  eq(patch, undefined);
});

await test("a result already marked as an error is not decorated twice", async () => {
  const h = buildHarness();
  await h.fire("session_start", {});
  const patch = await h.fire("tool_result", {
    toolName: "subagent",
    input: { agent: "reviewer" },
    isError: true,
    details: {},
    content: [{ type: "text", text: "Subagent run failed before producing output." }],
  });
  eq(patch, undefined);
});

// ---------------------------------------------------------------------------
// 4. The detached failure that never became a tool result at all
// ---------------------------------------------------------------------------

await test("a detached failure reaches the caller as a follow-up it must address", async () => {
  writeFileSync(
    historyFile,
    '{"agent":"reviewer","task":"[redacted]","ts":1786347480,"status":"ok","duration":199065}\n',
  );
  const h = buildHarness();
  await h.fire("session_start", {});

  // Nothing new yet: the run that was already on disk stays quiet.
  await h.fire("agent_settled", {});
  eq(h.sent.length, 0);

  // The detached reviewer dies while the caller is busy elsewhere.
  writeFileSync(
    historyFile,
    '{"agent":"reviewer","task":"[redacted]","ts":1786347480,"status":"ok","duration":199065}\n' +
      '{"agent":"reviewer","task":"[redacted]","ts":1786347745,"status":"error","duration":1687,"exit":1}\n',
  );
  await h.fire("agent_settled", {});

  eq(h.sent.length, 1);
  ok(h.sent[0]!.content.includes("1 subagent run failed"), h.sent[0]!.content);
  ok(h.sent[0]!.content.includes("did not happen"));
  // followUp + triggerTurn is what makes it a turn the agent has to take.
  eq(h.sent[0]!.options.deliverAs, "followUp");
  eq(h.sent[0]!.options.triggerTurn, true);

  // And it is announced once, not on every settle after it.
  await h.fire("agent_settled", {});
  eq(h.sent.length, 1);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
rmSync(workDir, { recursive: true, force: true });
if (failed > 0) process.exit(1);
