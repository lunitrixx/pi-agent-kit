/**
 * failure.test.ts - recognising a dead run, and not mistaking a report for one.
 *
 * Run: npx tsx extensions/lntrx-subagent-audit/tests/failure.test.ts
 *
 * The failing fixtures are quoted from the session of 2026-08-10, down to the
 * `isError: false` that came with them.
 */
import { strict as assert } from "node:assert";
import { contentToText, detectFailure, failureNotice, stripQuotedBlocks } from "../src/failure.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

function eq(a: any, b: any) { assert.equal(a, b); }
function ok(v: any, msg?: string) { assert.ok(v, msg); }

// ---------------------------------------------------------------------------
// The four failures
// ---------------------------------------------------------------------------

const STATUS_RESULT = `Status target: run 4a11f660
Spawn budget: unlimited
Run: 4a11f660
State: remembered foreground
Mode: single
1. reviewer failed, exit 1, acceptance: rejected, error: No API key found for anthropic.
Resume: unavailable; no child session file was persisted.`;

const WORKFLOW_RESULT = `Run 'review' failed: No API key found for anthropic.

Use /login to log into a provider via OAuth or API key.`;

const NOTIFY_RESULT = `Background task failed: **workflow**

Error: Run 'review' failed: No API key found for anthropic.`;

test("the status result that was reported as a success is a failure", () => {
  const signal = detectFailure([{ type: "text", text: STATUS_RESULT }]);
  eq(signal.failed, true);
  eq(signal.exit, 1);
});

test("a failed workflow step is a failure", () => {
  eq(detectFailure(WORKFLOW_RESULT).failed, true);
});

test("the async completion notice is a failure", () => {
  eq(detectFailure(NOTIFY_RESULT).failed, true);
});

test("a run that died before writing anything is a failure", () => {
  eq(detectFailure("Subagent run failed before producing output.").failed, true);
});

test("exhausted startup retries are a failure", () => {
  eq(
    detectFailure("Subagent failed to start after 4 attempts on deepseek-v4-pro; no model activity.")
      .failed,
    true,
  );
});

test("the marker quotes the line that gave it away", () => {
  const signal = detectFailure(WORKFLOW_RESULT);
  ok(signal.marker?.startsWith("Run 'review' failed:"));
});

// ---------------------------------------------------------------------------
// A review that reports failures is still a successful review
// ---------------------------------------------------------------------------

const GOOD_REVIEW = `## Findings

- **High** \`app/Http/Kernel.php:22\` - 3 tests failed after this change and the
  build failed on CI. The middleware order is wrong.
- The reviewer failed to find any test for the guard clause.

## Residual risks
None.`;

test("a review reporting failed tests is not a failed run", () => {
  eq(detectFailure(GOOD_REVIEW).failed, false);
});

test("prose containing the word failed mid-line is not a failed run", () => {
  eq(detectFailure("Everything passed; nothing failed, exit criteria met.").failed, false);
});

test("an ordinary successful result is not a failed run", () => {
  eq(detectFailure("1. reviewer completed, exit 0, acceptance: accepted").failed, false);
});

test("a review that quotes a marker in a fenced block is not a failed run", () => {
  // The self-referential worst case: a reviewer reviewing this extension.
  const review = [
    "## Findings",
    "",
    "`failure.ts:38` matches this line:",
    "",
    "```",
    "Run 'review' failed: No API key found for anthropic.",
    "Subagent run failed before producing output.",
    "```",
    "",
    "That pattern looks correct to me.",
  ].join("\n");
  eq(detectFailure(review).failed, false);
});

test("a marker inside a blockquote is not a failed run either", () => {
  eq(detectFailure("Quoting the harness:\n\n> Background task failed: workflow\n").failed, false);
});

test("a real marker outside a fence is still caught in the same message", () => {
  const mixed = "```\nRun 'x' failed: quoted\n```\n\nBackground task failed: **workflow**";
  eq(detectFailure(mixed).failed, true);
});

test("empty content is not a failed run", () => {
  eq(detectFailure([]).failed, false);
  eq(detectFailure(undefined).failed, false);
});

// ---------------------------------------------------------------------------
// Flattening and the notice
// ---------------------------------------------------------------------------

test("strips fences and blockquotes, keeps ordinary prose", () => {
  eq(stripQuotedBlocks("keep\n```\ndrop\n```\n> drop\nkeep2"), "keep\nkeep2");
});

test("an unterminated fence swallows the rest, rather than half-reading it", () => {
  eq(stripQuotedBlocks("keep\n```\ndrop\ndrop2"), "keep");
});

test("flattens a content array into text", () => {
  eq(contentToText([{ type: "text", text: "a" }, { type: "text", text: "b" }]), "a\nb");
});

test("ignores blocks that carry no text", () => {
  eq(contentToText([{ type: "image" }, { type: "text", text: "a" }]), "\na");
});

test("the notice tells the caller not to report the work as done", () => {
  const notice = failureNotice({ failed: true, marker: "Run 'review' failed:", exit: 1 });
  ok(notice.includes("exit 1"));
  ok(notice.toLowerCase().includes("did not do its work"));
  ok(notice.includes("/subagent-audit"));
});

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
