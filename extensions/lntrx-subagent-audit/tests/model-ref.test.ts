/**
 * model-ref.test.ts - the preflight that would have caught 2026-08-10.
 *
 * Run: npx tsx extensions/lntrx-subagent-audit/tests/model-ref.test.ts
 *
 * The registry below is this machine's real one, reduced: OpenRouter is the only
 * provider with credentials, and its catalogue carries model ids that contain a
 * slash of their own. That is the whole trap.
 */
import { strict as assert } from "node:assert";
import {
  applyModelRewrite,
  collectModelRefs,
  splitThinkingSuffix,
  suggestModels,
  verifyModelRef,
  type ModelEntry,
} from "../src/model-ref.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

function eq(a: any, b: any) { assert.equal(a, b); }
function ok(v: any, msg?: string) { assert.ok(v, msg); }
function deepEq(a: any, b: any) { assert.deepEqual(a, b); }

const AVAILABLE: ModelEntry[] = [
  { provider: "openrouter", id: "anthropic/claude-sonnet-4" },
  { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
  { provider: "openrouter", id: "deepseek/deepseek-v4-pro" },
  { provider: "openrouter", id: "deepseek/deepseek-v4-flash" },
];

// ---------------------------------------------------------------------------
// Thinking suffixes
// ---------------------------------------------------------------------------

test("splits a known thinking suffix", () => {
  deepEq(splitThinkingSuffix("deepseek-v4-pro:high"), { base: "deepseek-v4-pro", suffix: ":high" });
});

test("leaves a colon that is part of the model id", () => {
  deepEq(splitThinkingSuffix("anthropic/claude-sonnet-4.5:batch"), {
    base: "anthropic/claude-sonnet-4.5:batch",
    suffix: "",
  });
});

test("leaves a reference with no colon", () => {
  deepEq(splitThinkingSuffix("deepseek-v4-pro"), { base: "deepseek-v4-pro", suffix: "" });
});

// ---------------------------------------------------------------------------
// The failure of 2026-08-10
// ---------------------------------------------------------------------------

test("anthropic/claude-sonnet-4 is rewritten to its real provider, not refused", () => {
  const verdict = verifyModelRef("anthropic/claude-sonnet-4", AVAILABLE, "openrouter");
  eq(verdict.kind, "rewrite");
  if (verdict.kind !== "rewrite") return;
  eq(verdict.to, "openrouter/anthropic/claude-sonnet-4");
  eq(verdict.provider, "openrouter");
});

test("the thinking suffix survives the rewrite", () => {
  const verdict = verifyModelRef("anthropic/claude-sonnet-4:high", AVAILABLE, "openrouter");
  eq(verdict.kind, "rewrite");
  if (verdict.kind !== "rewrite") return;
  eq(verdict.to, "openrouter/anthropic/claude-sonnet-4:high");
});

test("a model no configured provider can reach is refused", () => {
  const verdict = verifyModelRef("anthropic/claude-opus-9", AVAILABLE, "openrouter");
  eq(verdict.kind, "unavailable");
  if (verdict.kind !== "unavailable") return;
  eq(verdict.provider, "anthropic");
});

test("the refusal names reachable alternatives", () => {
  const verdict = verifyModelRef("mistral/deepseek-v4-pro", AVAILABLE, "openrouter");
  eq(verdict.kind, "unavailable");
  if (verdict.kind !== "unavailable") return;
  ok(verdict.suggestions.includes("openrouter/deepseek/deepseek-v4-pro"));
});

// ---------------------------------------------------------------------------
// The eleven runs that succeeded must keep succeeding
// ---------------------------------------------------------------------------

test("the bare name the successful runs used is left untouched", () => {
  eq(verifyModelRef("deepseek-v4-pro", AVAILABLE, "openrouter").kind, "ok");
});

test("the bare name with its thinking suffix is left untouched", () => {
  eq(verifyModelRef("deepseek-v4-pro:high", AVAILABLE, "openrouter").kind, "ok");
});

test("a canonical provider/id reference is left untouched", () => {
  eq(verifyModelRef("openrouter/deepseek/deepseek-v4-pro", AVAILABLE, "openrouter").kind, "ok");
});

test("a typo under a provider we do hold credentials for is left to pi", () => {
  eq(verifyModelRef("openrouter/nonexistent-model", AVAILABLE, "openrouter").kind, "ok");
});

test("an empty registry means no opinion", () => {
  eq(verifyModelRef("anthropic/claude-sonnet-4", [], "openrouter").kind, "ok");
});

test("an empty reference means no opinion", () => {
  eq(verifyModelRef("", AVAILABLE, "openrouter").kind, "ok");
});

test("a reachable provider wins over an id that happens to spell it", () => {
  // With anthropic credentials configured, "anthropic/claude-sonnet-4" is a
  // provider-qualified anthropic reference. Rewriting it to the OpenRouter
  // model of the same name would move the run to another vendor and another
  // bill behind the caller's back.
  const both: ModelEntry[] = [
    { provider: "anthropic", id: "claude-sonnet-4-5" },
    { provider: "openrouter", id: "anthropic/claude-sonnet-4" },
  ];
  eq(verifyModelRef("anthropic/claude-sonnet-4", both, "openrouter").kind, "ok");
});

test("without those credentials the same reference is still corrected", () => {
  eq(verifyModelRef("anthropic/claude-sonnet-4", AVAILABLE, "openrouter").kind, "rewrite");
});

test("a provider with several matching ids prefers the session provider", () => {
  const models: ModelEntry[] = [
    { provider: "groq", id: "anthropic/claude-sonnet-4" },
    { provider: "openrouter", id: "anthropic/claude-sonnet-4" },
  ];
  const verdict = verifyModelRef("anthropic/claude-sonnet-4", models, "openrouter");
  eq(verdict.kind, "rewrite");
  if (verdict.kind !== "rewrite") return;
  eq(verdict.to, "openrouter/anthropic/claude-sonnet-4");
});

// ---------------------------------------------------------------------------
// Finding the model argument wherever the caller put it
// ---------------------------------------------------------------------------

test("collects the plain model argument", () => {
  deepEq(collectModelRefs({ agent: "reviewer", model: "anthropic/claude-sonnet-4" }), [
    "anthropic/claude-sonnet-4",
  ]);
});

test("collects a model out of a workflowScript, which is where the failures had it", () => {
  const input = {
    workflowScript:
      "return runs.run('review', { agent: 'reviewer', task: `x`, context: 'fresh', model: 'anthropic/claude-sonnet-4' });",
  };
  deepEq(collectModelRefs(input), ["anthropic/claude-sonnet-4"]);
});

test("collects models out of modelOverrides in both shapes", () => {
  const refs = collectModelRefs({
    modelOverrides: { reviewer: "deepseek-v4-pro", worker: { model: "deepseek-v4-flash" } },
  });
  deepEq(refs.sort(), ["deepseek-v4-flash", "deepseek-v4-pro"]);
});

test("de-duplicates repeated references", () => {
  const refs = collectModelRefs({
    model: "deepseek-v4-pro",
    workflowScript: "runs.run('a', { model: 'deepseek-v4-pro' }); runs.run('b', { model: 'deepseek-v4-pro' })",
  });
  deepEq(refs, ["deepseek-v4-pro"]);
});

test("no model argument at all yields nothing", () => {
  deepEq(collectModelRefs({ agent: "reviewer", task: "review this" }), []);
});

// ---------------------------------------------------------------------------
// Rewriting the tool input in place
// ---------------------------------------------------------------------------

test("rewrites the plain model argument", () => {
  const input: any = { agent: "reviewer", model: "anthropic/claude-sonnet-4" };
  ok(applyModelRewrite(input, "anthropic/claude-sonnet-4", "openrouter/anthropic/claude-sonnet-4"));
  eq(input.model, "openrouter/anthropic/claude-sonnet-4");
});

test("rewrites inside a workflowScript and keeps the quoting", () => {
  const input: any = {
    workflowScript: "return runs.run('review', { agent: 'reviewer', model: 'anthropic/claude-sonnet-4' });",
  };
  ok(applyModelRewrite(input, "anthropic/claude-sonnet-4", "openrouter/anthropic/claude-sonnet-4"));
  ok(input.workflowScript.includes("model: 'openrouter/anthropic/claude-sonnet-4'"));
});

test("rewrites nested modelOverrides", () => {
  const input: any = { modelOverrides: { reviewer: { model: "anthropic/claude-sonnet-4" } } };
  ok(applyModelRewrite(input, "anthropic/claude-sonnet-4", "openrouter/anthropic/claude-sonnet-4"));
  eq(input.modelOverrides.reviewer.model, "openrouter/anthropic/claude-sonnet-4");
});

test("a reference that is not there changes nothing", () => {
  const input: any = { model: "deepseek-v4-pro" };
  eq(applyModelRewrite(input, "anthropic/claude-sonnet-4", "x"), false);
  eq(input.model, "deepseek-v4-pro");
});

test("suggestions match on the last id segment", () => {
  ok(suggestModels("mistral/claude-sonnet-4", AVAILABLE).includes("openrouter/anthropic/claude-sonnet-4"));
});

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
