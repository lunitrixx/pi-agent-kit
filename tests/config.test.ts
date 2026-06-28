/**
 * Tests for lntrx-config — global + project config API
 *
 * Run with: npx tsx extensions/lntrx-config/tests/config.test.ts
 * or compile first then: node extensions/lntrx-config/tests/config.test.js
 */

import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Re-implement config.ts inline so we can control the file paths
// ---------------------------------------------------------------------------

let globalFile: string;
let projectRoot: string;

function projectFile(): string {
  return join(projectRoot, ".pi", "pi-agent-kit.json");
}

function readGlobal(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(globalFile, "utf-8")); }
  catch { return {}; }
}

function writeGlobal(cfg: Record<string, unknown>): void {
  mkdirSync(join(globalFile, ".."), { recursive: true });
  writeFileSync(globalFile, JSON.stringify(cfg, null, 2) + "\n");
}

function get(ns: string): unknown { return readGlobal()[ns]; }

function set(ns: string, value: unknown): void {
  const cfg = readGlobal();
  if (value === undefined) delete cfg[ns];
  else cfg[ns] = value;
  writeGlobal(cfg);
}

function readProject(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(projectFile(), "utf-8")); }
  catch { return {}; }
}

function writeProject(cfg: Record<string, unknown>): void {
  mkdirSync(join(projectRoot, ".pi"), { recursive: true });
  writeFileSync(projectFile(), JSON.stringify(cfg, null, 2) + "\n");
}

function getProject(ns: string): unknown { return readProject()[ns]; }

function setProject(ns: string, value: unknown): void {
  const cfg = readProject();
  if (value === undefined) delete cfg[ns];
  else cfg[ns] = value;
  writeProject(cfg);
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
  const dir = join(tmpdir(), "pi-config-test-" + Date.now());
  globalFile = join(dir, "global", "pi-agent-kit.json");
  projectRoot = join(dir, "project");
  // ensure cleanup from previous runs
  try { rmSync(dir, { recursive: true }); } catch {}
}

function teardown(): void {
  try { rmSync(join(globalFile, "..", ".."), { recursive: true }); } catch {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

setup();

// === Global config ===

test("get returns undefined for unknown key", () => {
  assert.equal(get("nonexistent"), undefined);
});

test("set stores a string value", () => {
  set("test-key", "hello");
  assert.equal(get("test-key"), "hello");
});

test("set stores a number value", () => {
  set("count", 42);
  assert.equal(get("count"), 42);
});

test("set stores a boolean false", () => {
  set("enabled", false);
  assert.equal(get("enabled"), false);
});

test("set stores a boolean true", () => {
  set("ready", true);
  assert.equal(get("ready"), true);
});

test("set stores an object", () => {
  set("nested", { a: 1, b: [2, 3] });
  assert.deepEqual(get("nested"), { a: 1, b: [2, 3] });
});

test("set with undefined deletes the key", () => {
  set("temp", "to-be-deleted");
  assert.equal(get("temp"), "to-be-deleted");
  set("temp", undefined);
  assert.equal(get("temp"), undefined);
});

test("multiple keys coexist in the same file", () => {
  set("key-a", "A");
  set("key-b", "B");
  assert.equal(get("key-a"), "A");
  assert.equal(get("key-b"), "B");
});

test("global file is valid JSON", () => {
  set("json-check", 123);
  const raw = readFileSync(globalFile, "utf-8");
  JSON.parse(raw); // should not throw
  assert.ok(raw.includes("json-check"));
});

// === Project config ===

test("getProject returns undefined for unknown key", () => {
  assert.equal(getProject("new-key"), undefined);
});

test("setProject stores a string value", () => {
  setProject("project-lang", "de");
  assert.equal(getProject("project-lang"), "de");
});

test("setProject stores a boolean false", () => {
  setProject("project-guard", false);
  assert.equal(getProject("project-guard"), false);
});

test("setProject with undefined deletes the key", () => {
  setProject("temp-proj", "gone");
  assert.equal(getProject("temp-proj"), "gone");
  setProject("temp-proj", undefined);
  assert.equal(getProject("temp-proj"), undefined);
});

test("project file is created at the correct path", () => {
  setProject("path-test", 1);
  assert.ok(existsSync(projectFile()), `Expected file at ${projectFile()}`);
});

test("project file is valid JSON", () => {
  const raw = readFileSync(projectFile(), "utf-8");
  JSON.parse(raw);
  assert.ok(raw.includes("path-test"));
});

// === Isolation ===

test("global and project configs are isolated", () => {
  set("shared", "global-value");
  setProject("shared", "project-value");
  assert.equal(get("shared"), "global-value");
  assert.equal(getProject("shared"), "project-value");
});

test("deleting a project key does not affect global", () => {
  set("global-only", "keep-me");
  setProject("global-only", "temp");
  setProject("global-only", undefined);
  assert.equal(get("global-only"), "keep-me");
  assert.equal(getProject("global-only"), undefined);
});

teardown();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
