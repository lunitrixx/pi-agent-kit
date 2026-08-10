/**
 * hook-path.test.ts - the hook path in a worktree.
 *
 * Run: npx tsx extensions/lntrx-githooks/tests/hook-path.test.ts
 *
 * `<repo>/.git/hooks/pre-commit` is not a path in a worktree: `.git` is a file
 * there. Writing it threw ENOTDIR out of session_start, and the resulting
 * "Extension error" line was printed by every agent working in a worktree -
 * including inside the reviewer subagents that failed on 2026-08-10, where it
 * sat directly above the error that actually killed the run.
 *
 * Builds real repositories in a temporary directory. No network, no fixtures.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHookPath } from "../src/extension.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e: any) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

function eq(a: any, b: any) { assert.equal(a, b); }
function ok(v: any, msg?: string) { assert.ok(v, msg); }

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

const root = mkdtempSync(join(tmpdir(), "lntrx-githooks-"));
const main = join(root, "main");
const worktree = join(root, "wt");

execFileSync("git", ["init", "-q", "-b", "main", main]);
git(main, "config", "user.email", "test@example.com");
git(main, "config", "user.name", "Test");
git(main, "commit", "-q", "--allow-empty", "-m", "root");
git(main, "worktree", "add", "-q", "-b", "feat/x", worktree);

// ---------------------------------------------------------------------------

test("a plain checkout resolves to its own hooks directory", () => {
  const path = resolveHookPath(main, "pre-commit");
  ok(path, "expected a path");
  ok(path!.endsWith("/hooks/pre-commit"), path);
});

test("a worktree really does have a .git file, not a directory", () => {
  ok(statSync(join(worktree, ".git")).isFile(), "test premise: .git is a file in a worktree");
});

test("the naive path a worktree used to be given is not a directory", () => {
  ok(!existsSync(join(worktree, ".git", "hooks")), "the old join() path cannot exist");
});

test("a worktree resolves to the shared hooks directory instead of throwing", () => {
  const path = resolveHookPath(worktree, "pre-commit");
  ok(path, "expected a path");
  ok(path!.endsWith("/hooks/pre-commit"), path);
  ok(!path!.includes("/wt/.git/"), `must not point inside the worktree .git file: ${path}`);
});

test("both checkouts of one repository share the hook", () => {
  eq(resolveHookPath(main, "pre-commit"), resolveHookPath(worktree, "pre-commit"));
});

test("core.hooksPath is respected", () => {
  git(main, "config", "core.hooksPath", join(root, "custom-hooks"));
  const path = resolveHookPath(main, "pre-commit");
  ok(path?.startsWith(join(root, "custom-hooks")), path);
  git(main, "config", "--unset", "core.hooksPath");
});

test("outside a repository there is no path and no exception", () => {
  eq(resolveHookPath(root, "pre-commit"), undefined);
});

test("a directory that does not exist yields no path", () => {
  eq(resolveHookPath(join(root, "gone"), "pre-commit"), undefined);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
rmSync(root, { recursive: true, force: true });
if (failed > 0) process.exit(1);
