/**
 * Tests for lntrx-memory helpers and SQLite round-trip.
 *
 * Run with Node 24+:
 *   npx tsx extensions/lntrx-memory/tests/extension.test.ts
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { DatabaseSync } = await (async () => {
  try { return await import("node:sqlite"); } catch {
    const { createRequire } = await import("node:module");
    return createRequire(import.meta.url)("node:sqlite");
  }
})().catch(() => { console.error("node:sqlite not available - need Node 24+"); process.exit(1); }) as { DatabaseSync: { new (p: string): any } };

import {
  GLOBAL_SCOPE,
  defaultDbPath,
  detectProject,
  getLastAssistantText,
  getText,
  openDb,
  parseRememberBlocks,
  toFtsQuery,
} from "../src/extension.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  (async () => {
    try { await fn(); passed++; console.log(`  OK ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL ${name}: ${e.message}`); }
  })();
}

function tmpDb(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lntrx-mem-")), "memory.db");
}

await new Promise((r) => setTimeout(r, 100));

// ---------------------------------------------------------------------------
// toFtsQuery
// ---------------------------------------------------------------------------

console.log("\n--- toFtsQuery ---");

assert.equal(toFtsQuery(""), "");
assert.equal(toFtsQuery("   "), "");
assert.equal(toFtsQuery("hello world"), '"hello"* AND "world"*');
assert.equal(toFtsQuery("Hello WORLD"), '"hello"* AND "world"*');
assert.equal(toFtsQuery("a hello b world c"), '"hello"* AND "world"*');
assert.equal(toFtsQuery("bug-tracker auth-flow"), '"bug"* AND "tracker"* AND "auth"* AND "flow"*');
assert.equal(toFtsQuery('"weird" prompt with: colons;'), '"weird"* AND "prompt"* AND "with"* AND "colons"*');
assert.equal(toFtsQuery("AND OR NOT NEAR test"), '"test"*');
console.log("  OK toFtsQuery (sync)");

test("toFtsQuery accepted by real FTS5", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE VIRTUAL TABLE t USING fts5(x);");
  const stmt = db.prepare("SELECT 1 FROM t WHERE t MATCH ?");
  for (const q of ["hello world", "bug-tracker auth", "--flag node", '"text"', "AND OR NOT NEAR", ""]) {
    const f = toFtsQuery(q);
    if (!f) continue;
    assert.doesNotThrow(() => stmt.all(f));
  }
  db.close();
});

// ---------------------------------------------------------------------------
// parseRememberBlocks
// ---------------------------------------------------------------------------

console.log("\n--- parseRememberBlocks ---");

test("empty when no tag", () => assert.deepEqual(parseRememberBlocks("text"), []));

test("single block, headline only", () => {
  const b = parseRememberBlocks("<remember>Use SQLite</remember>");
  assert.equal(b.length, 1);
  assert.equal(b[0].headline, "Use SQLite");
  assert.equal(b[0].category, "note");
  assert.equal(b[0].scope, "project");
});

test("headline/detail with --- separator", () => {
  const text = '<remember category="decision" labels="auth">\nUse PKCE\n---\nExplanation.\n</remember>';
  const [b] = parseRememberBlocks(text);
  assert.equal(b.category, "decision");
  assert.equal(b.labels, "auth");
  assert.equal(b.headline, "Use PKCE");
  assert.equal(b.detail, "Explanation.");
});

test("no separator, first line headline rest detail", () => {
  const [b] = parseRememberBlocks("<remember>Title\nLine 2\nLine 3</remember>");
  assert.equal(b.headline, "Title");
  assert.equal(b.detail, "Line 2\nLine 3");
});

test("scope: project and global", () => {
  const [a, b] = parseRememberBlocks('<remember scope="global">G</remember><remember scope="project">P</remember>');
  assert.equal(a.scope, "global");
  assert.equal(b.scope, "project");
});

test("unknown scope falls to project", () => {
  const [b] = parseRememberBlocks('<remember scope="weird">X</remember>');
  assert.equal(b.scope, "project");
});

test("empty skipped", () => {
  assert.deepEqual(parseRememberBlocks("<remember>   </remember>"), []);
});

test("multiple blocks", () => {
  const blocks = parseRememberBlocks("<remember>First</remember>text<remember category=\"bug\">Second\n---\nbody</remember>");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].category, "bug");
});

test("case-insensitive tag", () => {
  const [b] = parseRememberBlocks("<REMEMBER>Hi</REMEMBER>");
  assert.equal(b?.headline, "Hi");
});

test("kind attr maps to category for compat", () => {
  const [b] = parseRememberBlocks('<remember kind="decision">X</remember>');
  assert.equal(b.category, "decision");
});

// ---------------------------------------------------------------------------
// text extraction
// ---------------------------------------------------------------------------

console.log("\n--- text extraction ---");

test("getText string passthrough", () => assert.equal(getText("hello"), "hello"));
test("getText array of blocks", () => assert.equal(getText([{ type: "text", text: "one" }, { type: "tool" }, { type: "text", text: "two" }]), "one\ntwo"));
test("getText non-array empty", () => assert.equal(getText(undefined), ""));

test("getLastAssistantText picks last", () => {
  assert.equal(getLastAssistantText([
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "text", text: "final" }] },
  ]), "final");
});

test("getLastAssistantText empty when no assistant", () => {
  assert.equal(getLastAssistantText([{ role: "user", content: "hi" }]), "");
});

// ---------------------------------------------------------------------------
// SQLite round-trip (new schema)
// ---------------------------------------------------------------------------

console.log("\n--- SQLite ---");

test("openDb creates entries + bugs tables with FTS", () => {
  const db = openDb(tmpDb());
  db.prepare(
    "INSERT INTO entries(scope, project, category, headline, detail, labels) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("project", "/proj/a", "decision", "Use SQLite", "Built into Node", "sqlite,decision");
  const hits = db
    .prepare("SELECT e.headline FROM entries_idx f JOIN entries e ON e.id = f.rowid WHERE entries_idx MATCH ?")
    .all('"sqlite"*') as Array<{ headline: string }>;
  assert.equal(hits.length, 1);
  assert.equal(hits[0].headline, "Use SQLite");
  db.close();
});

test("delete cascades to FTS", () => {
  const db = openDb(tmpDb());
  const ins = db.prepare("INSERT INTO entries(scope, project, category, headline) VALUES ('project','/p','note',?)");
  ins.run("alpha bravo");
  ins.run("alpha charlie");
  const before = db.prepare("SELECT COUNT(*) AS n FROM entries_idx WHERE entries_idx MATCH ?").get('"alpha"*') as { n: number };
  assert.equal(before.n, 2);
  db.prepare("DELETE FROM entries WHERE headline = 'alpha bravo'").run();
  const after = db.prepare("SELECT COUNT(*) AS n FROM entries_idx WHERE entries_idx MATCH ?").get('"alpha"*') as { n: number };
  assert.equal(after.n, 1);
  db.close();
});

test("project scope returns project + global, hides other projects", () => {
  const db = openDb(tmpDb());
  const ins = db.prepare("INSERT INTO entries(scope, project, category, headline) VALUES (?,?,?,?)");
  ins.run("project", "/proj/a", "note", "alpha A");
  ins.run("project", "/proj/b", "note", "alpha B");
  ins.run("global", GLOBAL_SCOPE, "preference", "alpha global");

  const rows = db
    .prepare("SELECT e.headline FROM entries_idx f JOIN entries e ON e.id = f.rowid WHERE entries_idx MATCH ? AND (e.project = ? OR e.scope = 'global') ORDER BY e.headline")
    .all('"alpha"*', "/proj/a") as Array<{ headline: string }>;
  assert.deepEqual(rows.map((r) => r.headline), ["alpha A", "alpha global"]);
  db.close();
});

test("bugs table with CHECK constraints", () => {
  const db = openDb(tmpDb());
  db.prepare("INSERT INTO bugs(project, symptom, solution) VALUES (?, ?, ?)").run("/p", "TypeError", "Added null check");
  const row = db.prepare("SELECT symptom, solution, state FROM bugs WHERE project = ?").get("/p") as any;
  assert.equal(row.symptom, "TypeError");
  assert.equal(row.solution, "Added null check");
  assert.equal(row.state, "open");
  db.close();
});

test("bug state transitions", () => {
  const db = openDb(tmpDb());
  db.prepare("INSERT INTO bugs(project, symptom) VALUES ('/p', 'err')").run();
  const ins = db.prepare("SELECT id FROM bugs WHERE project = '/p' LIMIT 1").get() as { id: number };
  db.prepare("UPDATE bugs SET state = 'fixed' WHERE id = ?").run(ins.id);
  const row = db.prepare("SELECT state FROM bugs WHERE id = ?").get(ins.id) as { state: string };
  assert.equal(row.state, "fixed");
  db.close();
});

test("CHECK constraint rejects invalid states", () => {
  const db = openDb(tmpDb());
  assert.throws(() => db.prepare("INSERT INTO bugs(project, symptom, state) VALUES ('/p','err','invalid')").run());
  db.close();
});

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

console.log("\n--- paths ---");

test("defaultDbPath honours LNTRX_MEMORY_DB", () => {
  const prev = process.env.LNTRX_MEMORY_DB;
  process.env.LNTRX_MEMORY_DB = "/tmp/custom.db";
  try { assert.equal(defaultDbPath(), "/tmp/custom.db"); }
  finally { if (prev === undefined) delete process.env.LNTRX_MEMORY_DB; else process.env.LNTRX_MEMORY_DB = prev; }
});

test("defaultDbPath falls back to XDG", () => {
  const prevDb = process.env.LNTRX_MEMORY_DB;
  const prevXdg = process.env.XDG_DATA_HOME;
  delete process.env.LNTRX_MEMORY_DB;
  process.env.XDG_DATA_HOME = "/tmp/xdg";
  try { assert.equal(defaultDbPath(), "/tmp/xdg/pi/memory.db"); }
  finally {
    if (prevDb === undefined) delete process.env.LNTRX_MEMORY_DB; else process.env.LNTRX_MEMORY_DB = prevDb;
    if (prevXdg === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = prevXdg;
  }
});

test("detectProject honours LNTRX_MEMORY_PROJECT", () => {
  const prev = process.env.LNTRX_MEMORY_PROJECT;
  process.env.LNTRX_MEMORY_PROJECT = "/explicit/proj";
  try { assert.equal(detectProject("/somewhere"), "/explicit/proj"); }
  finally { if (prev === undefined) delete process.env.LNTRX_MEMORY_PROJECT; else process.env.LNTRX_MEMORY_PROJECT = prev; }
});

// ---------------------------------------------------------------------------

await new Promise((r) => setTimeout(r, 500));
console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
