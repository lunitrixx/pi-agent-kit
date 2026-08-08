/**
 * rules.test.ts - tests for the rules engine
 *
 * Run: npx tsx extensions/lntrx-permit/tests/rules.test.ts
 */
import { strict as assert } from "node:assert";
import { checkPath, checkTool, checkBash, checkExternalDirectory, mostRestrictive, applyFailClosed } from "../src/rules.js";
import type { SurfaceResults, Decision } from "../src/rules.js";
import { normalizeCommand } from "../src/shell.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

const CWD = "/home/user/project";

// ---------------------------------------------------------------------------
// Path surface
// ---------------------------------------------------------------------------

test("path: .env is denied", () => {
  const r = checkPath("/home/user/project/.env", [
    { pattern: "*.env", decision: "deny" },
  ], CWD);
  assert.equal(r, "deny");
});

test("path: .env.example is allowed (exception after catch-all)", () => {
  // The last match wins in our rules list
  const r = checkPath("/home/user/project/.env.example", [
    { pattern: "*.env", decision: "deny" },
    { pattern: "*.env.example", decision: "allow" },
  ], CWD);
  assert.equal(r, "allow");
});

test("path: **/id_rsa matches nested path", () => {
  const r = checkPath("/home/user/project/vendor/id_rsa", [
    { pattern: "**/id_rsa*", decision: "deny" },
  ], CWD);
  assert.equal(r, "deny");
});

test("path: id_rsa.pub matches", () => {
  const r = checkPath("/home/user/project/id_rsa.pub", [
    { pattern: "**/id_rsa*", decision: "deny" },
  ], CWD);
  assert.equal(r, "deny");
});

test("path: safe file is allowed", () => {
  const r = checkPath("/home/user/project/src/app.ts", [
    { pattern: "*.env", decision: "deny" },
    { pattern: "*.env.example", decision: "allow" },
    { pattern: "**/id_rsa*", decision: "deny" },
    { pattern: "**/*.pem", decision: "deny" },
  ], CWD);
  assert.equal(r, "allow");
});

test("path: empty rules = allow", () => {
  const r = checkPath("/home/user/project/.env", [], CWD);
  assert.equal(r, "allow");
});

// ---------------------------------------------------------------------------
// External directory
// ---------------------------------------------------------------------------

test("external_directory: within cwd is allowed", () => {
  const r = checkExternalDirectory("/home/user/project/src/file.ts", "ask", CWD);
  assert.equal(r, "allow");
});

test("external_directory: outside cwd returns configured decision", () => {
  const r = checkExternalDirectory("/etc/passwd", "ask", CWD);
  assert.equal(r, "ask");
});

test("external_directory: cwd itself is allowed", () => {
  const r = checkExternalDirectory("/home/user/project", "ask", CWD);
  assert.equal(r, "allow");
});

// ---------------------------------------------------------------------------
// Tool surface
// ---------------------------------------------------------------------------

test("tool: wildcard matches everything", () => {
  const r = checkTool("bash", [{ pattern: "*", decision: "allow" }]);
  assert.equal(r, "allow");
});

test("tool: specific tool match", () => {
  const r = checkTool("mcp__git", [
    { pattern: "*", decision: "allow" },
    { pattern: "mcp__*", decision: "ask" },
  ]);
  assert.equal(r, "ask");
});

test("tool: deny overrides earlier allow", () => {
  const r = checkTool("mcp__dangerous", [
    { pattern: "*", decision: "allow" },
    { pattern: "mcp__dangerous", decision: "deny" },
  ]);
  assert.equal(r, "deny");
});

// ---------------------------------------------------------------------------
// Bash surface
// ---------------------------------------------------------------------------

test("bash: rm --recursive matches", () => {
  const cmd = normalizeCommand("rm --recursive /tmp");
  const r = checkBash(cmd, [
    { pattern: "*", decision: "allow" },
    { pattern: "rm *--recursive*", decision: "ask" },
  ]);
  assert.equal(r, "ask");
});

test("bash: short form rm -r also matches", () => {
  const cmd = normalizeCommand("rm -r /tmp");
  const r = checkBash(cmd, [
    { pattern: "*", decision: "allow" },
    { pattern: "rm *--recursive*", decision: "ask" },
  ]);
  assert.equal(r, "ask");
});

test("bash: git push with force is caught", () => {
  const cmd = normalizeCommand("git push -f origin main");
  const r = checkBash(cmd, [
    { pattern: "*", decision: "allow" },
    { pattern: "git push *--force*", decision: "ask" },
  ]);
  assert.equal(r, "ask");
});

test("bash: safe command allowed", () => {
  const cmd = normalizeCommand("echo hello world");
  const r = checkBash(cmd, [
    { pattern: "*", decision: "allow" },
    { pattern: "rm *--recursive*", decision: "ask" },
  ]);
  assert.equal(r, "allow");
});

// ---------------------------------------------------------------------------
// Most-restrictive-wins
// ---------------------------------------------------------------------------

test("most-restrictive: deny beats ask", () => {
  const r = mostRestrictive({ bash: "allow", path: "deny", externalDirectory: "ask", tool: "allow" });
  assert.equal(r, "deny");
});

test("most-restrictive: ask beats allow", () => {
  const r = mostRestrictive({ bash: "ask", path: "allow", externalDirectory: "allow", tool: "allow" });
  assert.equal(r, "ask");
});

test("most-restrictive: all allow", () => {
  const r = mostRestrictive({ bash: "allow", path: "allow", externalDirectory: "allow", tool: "allow" });
  assert.equal(r, "allow");
});

// ---------------------------------------------------------------------------
// Fail-closed
// ---------------------------------------------------------------------------

test("fail-closed: unparseable escalates allow → ask (with UI)", () => {
  const r = applyFailClosed({ bash: "allow", path: "allow", externalDirectory: "allow", tool: "allow" }, true, true);
  assert.equal(r.bash, "ask");
});

test("fail-closed: unparseable escalates allow → deny (no UI)", () => {
  const r = applyFailClosed({ bash: "allow", path: "allow", externalDirectory: "allow", tool: "allow" }, true, false);
  assert.equal(r.bash, "deny");
});

test("fail-closed: already ask stays ask (with UI)", () => {
  const r = applyFailClosed({ bash: "ask", path: "allow", externalDirectory: "allow", tool: "allow" }, true, true);
  assert.equal(r.bash, "ask");
});

test("fail-closed: already ask escalates to deny (no UI)", () => {
  const r = applyFailClosed({ bash: "ask", path: "allow", externalDirectory: "allow", tool: "allow" }, true, false);
  assert.equal(r.bash, "deny");
});

test("fail-closed: parseable command unchanged", () => {
  const r = applyFailClosed({ bash: "allow", path: "allow", externalDirectory: "allow", tool: "allow" }, false, false);
  assert.equal(r.bash, "allow");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);