/**
 * shell.test.ts - tests for the shell tokenizer and normalizer
 *
 * Run: npx tsx extensions/lntrx-permit/tests/shell.test.ts
 */
import { strict as assert } from "node:assert";
import { normalizeCommand, segment, normalizeSegment } from "../src/shell.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

function eq(a: any, b: any) { assert.equal(a, b); }
function ok(v: any, msg?: string) { assert.ok(v, msg); }
function deepEq(a: any, b: any) { assert.deepEqual(a, b); }

// ---------------------------------------------------------------------------
// Segmenting
// ---------------------------------------------------------------------------

test("segment simple command", () => {
  deepEq(segment("ls -la"), ["ls -la"]);
});

test("segment with && separator", () => {
  deepEq(segment("cd /tmp && rm -rf data"), ["cd /tmp", "&&", "rm -rf data"]);
});

test("segment with ; separator", () => {
  deepEq(segment("echo a; echo b"), ["echo a", ";", "echo b"]);
});

test("segment respects single quotes", () => {
  const s = segment("echo 'hello; world'");
  eq(s.length, 1);
  ok(s[0].includes("hello; world"));
});

test("segment respects double quotes", () => {
  const s = segment(`echo "hello && world"`);
  eq(s.length, 1);
  ok(s[0].includes("hello && world"));
});

// ---------------------------------------------------------------------------
// Short flag expansion
// ---------------------------------------------------------------------------

test("expand rm -rf to --recursive --force", () => {
  const n = normalizeCommand("rm -rf /tmp");
  ok(n.flags.has("--recursive"), "should have --recursive");
  ok(n.flags.has("--force"), "should have --force");
  ok(n.canonical.includes("--force"), "canonical should include --force");
  ok(n.canonical.includes("--recursive"), "canonical should include --recursive");
});

test("expand git push -f to --force", () => {
  const n = normalizeCommand("git push -f origin main");
  ok(n.flags.has("--force"), "should have --force");
  ok(n.canonical.includes("--force"), "canonical includes --force");
  ok(!n.canonical.includes(" -f "), "short flag should be gone");
});

test("expand cp -rf to --recursive --force", () => {
  const n = normalizeCommand("cp -rf src dst");
  ok(n.flags.has("--recursive"));
  ok(n.flags.has("--force"));
});

// ---------------------------------------------------------------------------
// Long flags
// ---------------------------------------------------------------------------

test("long flags pass through unchanged", () => {
  const n = normalizeCommand("rm --recursive --force /tmp");
  ok(n.flags.has("--recursive"));
  ok(n.flags.has("--force"));
});

test("mixed short and long flags on rm", () => {
  const n = normalizeCommand("rm -rf --verbose /tmp");
  ok(n.flags.has("--recursive"));
  ok(n.flags.has("--force"));
  ok(n.flags.has("--verbose"));
});

// ---------------------------------------------------------------------------
// Prefix stripping
// ---------------------------------------------------------------------------

test("strip env prefix", () => {
  const n = normalizeCommand("env rm -f /tmp");
  eq(n.argv0, "rm");
});

test("strip env assignment prefix", () => {
  const n = normalizeCommand("FOO=1 rm -f /tmp");
  eq(n.argv0, "rm");
});

test("strip command prefix", () => {
  const n = normalizeCommand("command rm -f /tmp");
  eq(n.argv0, "rm");
});

// ---------------------------------------------------------------------------
// Git push +main → synthetic --force
// ---------------------------------------------------------------------------

test("git push origin +main adds --force", () => {
  const n = normalizeCommand("git push origin +main");
  ok(n.flags.has("--force"), "should recognize +refspec as force push");
  ok(n.canonical.includes("--force"), "canonical should include --force");
});

// ---------------------------------------------------------------------------
// Unparseable detection
// ---------------------------------------------------------------------------

test("command substitution is unparseable", () => {
  const n = normalizeCommand("echo $(whoami)");
  eq(n.unparseable, true);
});

test("backtick substitution is unparseable", () => {
  const n = normalizeCommand("echo `whoami`");
  eq(n.unparseable, true);
});

test("eval is unparseable", () => {
  const n = normalizeCommand("eval 'rm -rf /'");
  eq(n.unparseable, true);
});

test("IFS manipulation is unparseable", () => {
  const n = normalizeCommand("rm${IFS}-rf /");
  eq(n.unparseable, true);
});

test("${} expansion is unparseable", () => {
  const n = normalizeCommand("echo ${HOME}");
  eq(n.unparseable, true);
});

// ---------------------------------------------------------------------------
// bash -c recursion
// ---------------------------------------------------------------------------

test("bash -c expands inner command", () => {
  const n = normalizeCommand(`bash -c "rm -rf /"`);
  ok(n.canonical.includes("--force"), "should normalize flags inside -c");
  ok(n.canonical.includes("--recursive"));
});

// ---------------------------------------------------------------------------
// Canonical output
// ---------------------------------------------------------------------------

test("canonical is reproducible", () => {
  const a = normalizeCommand("rm -rf /tmp").canonical;
  const b = normalizeCommand("rm -rf /tmp").canonical;
  eq(a, b);
});

test("property: short and long forms produce same canonical", () => {
  const short = normalizeCommand("rm -rf /tmp").canonical;
  const long = normalizeCommand("rm --recursive --force /tmp").canonical;
  eq(short, long);
});

test("property: git push -f matches --force", () => {
  const short = normalizeCommand("git push -f origin main").canonical;
  const long = normalizeCommand("git push --force origin main").canonical;
  eq(short, long);
});

test("property: cp -f matches cp --force", () => {
  const short = normalizeCommand("cp -f a b").canonical;
  const long = normalizeCommand("cp --force a b").canonical;
  eq(short, long);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);