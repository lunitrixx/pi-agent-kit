/**
 * Integration tests for extension config logic.
 * Tests the actual config patterns used by lntrx-guard and lntrx-project-rules.
 *
 * Run with: npx tsx extensions/lntrx-config/tests/extensions-config.test.ts
 */

import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Inline config implementation (mirrors lntrx-config/src/config.ts)
// ---------------------------------------------------------------------------

let globalFile: string;
let projectRoot: string;

function projectFile(): string {
  return join(projectRoot, ".pi", "pi-agent-kit.json");
}

import { readFileSync } from "node:fs";

function readFile(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function get(ns: string): unknown {
  return readFile(globalFile)[ns];
}

function set(ns: string, value: unknown): void {
  const cfg = readFile(globalFile);
  if (value === undefined) delete cfg[ns];
  else cfg[ns] = value;
  mkdirSync(join(globalFile, ".."), { recursive: true });
  writeFileSync(globalFile, JSON.stringify(cfg, null, 2) + "\n");
}

function getProject(ns: string): unknown {
  return readFile(projectFile())[ns];
}

function setProject(ns: string, value: unknown): void {
  const cfg = readFile(projectFile());
  if (value === undefined) delete cfg[ns];
  else cfg[ns] = value;
  mkdirSync(join(projectRoot, ".pi"), { recursive: true });
  writeFileSync(projectFile(), JSON.stringify(cfg, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Replicate extension logic patterns
// ---------------------------------------------------------------------------

// --- Guard: on(repoPath) ---
const GUARD_NS = "lntrx-guard";

function guardOn(repoPath: string): boolean {
  const p = getProject(GUARD_NS);
  if (p !== undefined) return !!p;
  const g = get(GUARD_NS);
  return g === undefined ? true : !!g;
}

// --- Guard: riskEnabled(repoPath, id) ---
function riskConfigKey(id: string): string {
  return `${GUARD_NS}.risks.${id}`;
}

function riskEnabled(repoPath: string, id: string): boolean {
  const p = getProject(riskConfigKey(id));
  if (p !== undefined) return !!p;
  const g = get(riskConfigKey(id));
  return g === undefined ? true : !!g;
}

// --- Guard: hookEnabled ---
function hookConfigKey(): string {
  return "lntrx-guard.git-hooks.block-main-commit";
}

function hookEnabled(repoPath: string): boolean {
  const p = getProject(hookConfigKey());
  if (p !== undefined) return !!p;
  const g = get(hookConfigKey());
  return g === undefined ? true : !!g;
}

// --- Rules: isVisible ---
const RULES_KEY = "project-rules.visible";

function isVisible(repoPath: string): boolean {
  const p = getProject(RULES_KEY);
  if (p !== undefined) return !!p;
  const g = get(RULES_KEY);
  if (g !== undefined) return !!g;
  return true;
}

// --- Lang: resolveLanguage ---
const LANG_NS = "lntrx-lang";

function resolveLang(repoPath: string): string | undefined {
  const projectCode = getProject(LANG_NS) as string | undefined;
  return projectCode ?? get(LANG_NS) as string | undefined;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function setup(): void {
  const dir = join(tmpdir(), "pi-ext-config-test-" + Date.now());
  globalFile = join(dir, "global", "pi-agent-kit.json");
  projectRoot = join(dir, "project");
  try { rmSync(dir, { recursive: true }); } catch {}
}

function teardown(): void {
  try { rmSync(join(globalFile, "..", ".."), { recursive: true }); } catch {}
}

// ---------------------------------------------------------------------------
// Tests: guardOn
// ---------------------------------------------------------------------------

setup();

console.log("\n--- guard on/off ---");

test("guardOn defaults to true (no config)", () => {
  assert.equal(guardOn(projectRoot), true);
});

test("guardOn false when global is false", () => {
  set(GUARD_NS, false);
  assert.equal(guardOn(projectRoot), false);
  set(GUARD_NS, undefined);
});

test("guardOn false when project is false", () => {
  setProject(GUARD_NS, false);
  assert.equal(guardOn(projectRoot), false);
  setProject(GUARD_NS, undefined);
});

test("guardOn true when project true overrides global false", () => {
  set(GUARD_NS, false);
  setProject(GUARD_NS, true);
  assert.equal(guardOn(projectRoot), true);
  set(GUARD_NS, undefined);
  setProject(GUARD_NS, undefined);
});

test("guardOn true when global is true", () => {
  set(GUARD_NS, true);
  assert.equal(guardOn(projectRoot), true);
  set(GUARD_NS, undefined);
});

// ---------------------------------------------------------------------------
// Tests: riskEnabled
// ---------------------------------------------------------------------------

console.log("\n--- risk enable/disable ---");

test("riskEnabled defaults to true", () => {
  assert.equal(riskEnabled(projectRoot, "sudo"), true);
});

test("riskEnabled false when globally disabled", () => {
  set(riskConfigKey("sudo"), false);
  assert.equal(riskEnabled(projectRoot, "sudo"), false);
  set(riskConfigKey("sudo"), undefined);
});

test("riskEnabled false when project-disabled", () => {
  setProject(riskConfigKey("sudo"), false);
  assert.equal(riskEnabled(projectRoot, "sudo"), false);
  setProject(riskConfigKey("sudo"), undefined);
});

test("riskEnabled false when both disabled", () => {
  set(riskConfigKey("sudo"), false);
  setProject(riskConfigKey("sudo"), false);
  assert.equal(riskEnabled(projectRoot, "sudo"), false);
  set(riskConfigKey("sudo"), undefined);
  setProject(riskConfigKey("sudo"), undefined);
});

test("riskEnabled true when project true overrides global false", () => {
  set(riskConfigKey("sudo"), false);
  setProject(riskConfigKey("sudo"), true);
  assert.equal(riskEnabled(projectRoot, "sudo"), true);
  set(riskConfigKey("sudo"), undefined);
  setProject(riskConfigKey("sudo"), undefined);
});

test("riskEnabled — unrelated risk unaffected", () => {
  set(riskConfigKey("sudo"), false);
  assert.equal(riskEnabled(projectRoot, "pipe-shell"), true);
  assert.equal(riskEnabled(projectRoot, "sops-wildcard"), true);
  set(riskConfigKey("sudo"), undefined);
});

test("riskEnabled true after project-disable then enable", () => {
  setProject(riskConfigKey("pipe-shell"), false);
  assert.equal(riskEnabled(projectRoot, "pipe-shell"), false);
  setProject(riskConfigKey("pipe-shell"), undefined);
  assert.equal(riskEnabled(projectRoot, "pipe-shell"), true);
});

// ---------------------------------------------------------------------------
// Tests: hookEnabled
// ---------------------------------------------------------------------------

console.log("\n--- hook enable/disable ---");

test("hookEnabled defaults to true", () => {
  assert.equal(hookEnabled(projectRoot), true);
});

test("hookEnabled false when globally disabled", () => {
  set(hookConfigKey(), false);
  assert.equal(hookEnabled(projectRoot), false);
  set(hookConfigKey(), undefined);
});

test("hookEnabled false when project-disabled", () => {
  setProject(hookConfigKey(), false);
  assert.equal(hookEnabled(projectRoot), false);
  setProject(hookConfigKey(), undefined);
});

test("hookEnabled true when project true overrides global false", () => {
  set(hookConfigKey(), false);
  setProject(hookConfigKey(), true);
  assert.equal(hookEnabled(projectRoot), true);
  set(hookConfigKey(), undefined);
  setProject(hookConfigKey(), undefined);
});

// ---------------------------------------------------------------------------
// Tests: isVisible (project-rules banner)
// ---------------------------------------------------------------------------

console.log("\n--- rules banner visibility ---");

test("isVisible defaults to true", () => {
  assert.equal(isVisible(projectRoot), true);
});

test("isVisible false when global is false", () => {
  set(RULES_KEY, false);
  assert.equal(isVisible(projectRoot), false);
  set(RULES_KEY, undefined);
});

test("isVisible false when project is false", () => {
  setProject(RULES_KEY, false);
  assert.equal(isVisible(projectRoot), false);
  setProject(RULES_KEY, undefined);
});

test("isVisible true when project overrides global false", () => {
  set(RULES_KEY, false);
  setProject(RULES_KEY, true);
  assert.equal(isVisible(projectRoot), true);
  set(RULES_KEY, undefined);
  setProject(RULES_KEY, undefined);
});

test("isVisible false when project overrides global true", () => {
  set(RULES_KEY, true);
  setProject(RULES_KEY, false);
  assert.equal(isVisible(projectRoot), false);
  set(RULES_KEY, undefined);
  setProject(RULES_KEY, undefined);
});

test("isVisible true when project true, no global", () => {
  setProject(RULES_KEY, true);
  assert.equal(isVisible(projectRoot), true);
  setProject(RULES_KEY, undefined);
});

// ---------------------------------------------------------------------------
// Tests: resolveLang
// ---------------------------------------------------------------------------

console.log("\n--- lang resolution ---");

test("resolveLang undefined when nothing set", () => {
  assert.equal(resolveLang(projectRoot), undefined);
});

test("resolveLang returns project lang over global", () => {
  set(LANG_NS, "de");
  setProject(LANG_NS, "en");
  assert.equal(resolveLang(projectRoot), "en");
  set(LANG_NS, undefined);
  setProject(LANG_NS, undefined);
});

test("resolveLang falls back to global when project not set", () => {
  set(LANG_NS, "fr");
  assert.equal(resolveLang(projectRoot), "fr");
  set(LANG_NS, undefined);
});

test("resolveLang returns project lang when global not set", () => {
  setProject(LANG_NS, "ja");
  assert.equal(resolveLang(projectRoot), "ja");
  setProject(LANG_NS, undefined);
});

// ---------------------------------------------------------------------------
// Cleanup & summary
// ---------------------------------------------------------------------------

teardown();

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
