/**
 * lntrx-memory - cross-session memory for pi with SQLite + FTS5.
 *
 * Core logic: CRUD, checkpoint, hooks. Tools in tools.ts, commands in commands.ts.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  defaultDbPath,
  detectProject,
  GLOBAL_SCOPE,
  openDb,
  DatabaseSync,
  sqliteLoadError,
} from "./db.js";
import type { SqliteDB, Entry, Bug } from "./db.js";
import { scanAnatomy, anatomyToMarkdown } from "./scanner.js";
import {
  getLastAssistantText,
  toFtsQuery,
  formatEntries,
  parseRememberBlocks,
  getLastAssistantTextBuffer,
  setLastAssistantTextBuffer,
  isCorrection,
  hasErrorPattern,
} from "./text.js";
import { registerTools } from "./tools.js";
import { registerCommands } from "./commands.js";
import { get, getProject } from "../../../lib/config";

// Re-export for backward compat (tests import from extension.ts)
export { defaultDbPath, detectProject, GLOBAL_SCOPE, openDb, DatabaseSync, sqliteLoadError } from "./db.js";
export type { SqliteDB, Entry, Bug } from "./db.js";
export { loadIgnorePatterns, scanAnatomy, anatomyToMarkdown } from "./scanner.js";
export { getText, getLastAssistantText, toFtsQuery, parseRememberBlocks } from "./text.js";

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

const TOOL_GUIDANCE = [
  "Local memory (lntrx-memory) is available for cross-session recall.",
  "Use lntrx_memory_search to look up prior decisions, conventions, bugs, and preferences.",
  "Use lntrx_memory_learn (or wrap durable facts in <remember>...</remember> in your reply) to persist them.",
  "By default memories are scoped to the current project; pass scope:\"global\" for cross-project notes.",
].join(" ");

const SEARCH_HINT = [
  "You have access to cross-session memory via lntrx_memory_search.",
  "Call it before making decisions that could benefit from prior context.",
].join(" ");

// ---------------------------------------------------------------------------
// Secret redaction – inline port from lntrx-guard patterns (Phase 3.2)
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "OpenAI Key",       pattern: /sk-[A-Za-z0-9]{32,}/ },
  { name: "GitHub Token",     pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "AWS Key",          pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "Google API Key",   pattern: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: "JWT Token",        pattern: /eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+/=]*/ },
  { name: "Private Key",      pattern: /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/ },
  { name: "Slack Token",      pattern: /xox[baprs]-[0-9A-Za-z\-]{10,}/ },
  { name: "Stripe Key",       pattern: /[sr]k_live_[0-9a-zA-Z]{24,}/ },
];

function redact(text: string): string {
  let result = text;
  for (const s of SECRET_PATTERNS) {
    result = result.replace(s.pattern, `[REDACTED:${s.name}]`);
  }
  return result;
}

export default function memoryExtension(pi: ExtensionAPI) {
  const dbPath = defaultDbPath();
  let db: SqliteDB | null = null;
  let currentProject = detectProject(process.cwd());

  function ensureDb(): SqliteDB | null {
    if (db) return db;
    if (!DatabaseSync) return null;
    try {
      db = openDb(dbPath);
      return db;
    } catch (err) {
      sqliteLoadError = (err as Error).message;
      return null;
    }
  }

  function checkpoint(): void {
    const d = ensureDb();
    if (!d) return;
    try { d.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* best-effort */ }
  }

  function scopeProject(scope: "project" | "global"): string {
    return scope === "global" ? GLOBAL_SCOPE : currentProject;
  }

  // ---- Config ----

  function memoryMode(): "policy" | "inject" {
    const p = getProject(currentProject, "lntrx-memory.memoryMode");
    if (p === "inject" || p === "policy") return p;
    const g = get("lntrx-memory.memoryMode");
    if (g === "inject" || g === "policy") return g;
    return "policy";
  }

  // ---- CRUD ----

  function search(query: string, limit: number, scope: "project" | "global" | "all"): Entry[] {
    const d = ensureDb();
    if (!d) return [];
    const fts = toFtsQuery(query);
    const scopeFilter =
      scope === "all" ? ""
      : scope === "global" ? "AND e.scope = 'global'"
      : "AND (e.project = ? OR e.scope = 'global')";
    const params: unknown[] = [];
    let sql: string;
    if (fts) {
      sql = `SELECT e.id, e.created, e.scope, e.project, e.category, e.headline, e.detail, e.labels
        FROM entries_idx f JOIN entries e ON e.id = f.rowid
        WHERE entries_idx MATCH ? ${scopeFilter}
        ORDER BY rank, e.created DESC LIMIT ?`;
      params.push(fts);
    } else {
      sql = `SELECT id, created, scope, project, category, headline, detail, labels
        FROM entries e WHERE 1=1 ${scopeFilter}
        ORDER BY created DESC LIMIT ?`;
    }
    if (scope !== "all") params.push(currentProject);
    params.push(limit);
    try { return d.prepare(sql).all(...params) as Entry[]; } catch {
      if (!fts) return [];
      try {
        const fb: unknown[] = [];
        if (scope !== "all") fb.push(currentProject);
        fb.push(limit);
        return d.prepare(`SELECT id, created, scope, project, category, headline, detail, labels FROM entries e WHERE 1=1 ${scopeFilter} ORDER BY created DESC LIMIT ?`).all(...fb) as Entry[];
      } catch { return []; }
    }
  }

  function save(args: {
    headline: string; detail?: string; category?: string;
    labels?: string; scope?: "project" | "global";
  }): Entry | null {
    const d = ensureDb();
    if (!d) return null;
    const entry = {
      created: Math.floor(Date.now() / 1000),
      scope: args.scope || "project",
      project: scopeProject(args.scope || "project"),
      category: args.category || "note",
      headline: redact(args.headline.slice(0, 500)),
      detail: redact((args.detail || "").slice(0, 8000)),
      labels: args.labels || "",
    };
    const res = d.prepare("INSERT INTO entries(created, scope, project, category, headline, detail, labels) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(entry.created, entry.scope, entry.project, entry.category, entry.headline, entry.detail, entry.labels);
    checkpoint();
    return { id: Number(res.lastInsertRowid), ...entry };
  }

  function saveBug(symptom: string, solution: string): Bug | null {
    const d = ensureDb();
    if (!d) return null;
    const res = d.prepare("INSERT INTO bugs(created, project, symptom, solution) VALUES (unixepoch(), ?, ?, ?)")
      .run(currentProject, redact(symptom.slice(0, 2000)), redact(solution.slice(0, 2000)));
    checkpoint();
    return {
      id: Number(res.lastInsertRowid),
      created: Math.floor(Date.now() / 1000),
      project: currentProject, symptom, solution, state: "open",
    };
  }

  function listBugs(project: string): Bug[] {
    const d = ensureDb();
    if (!d) return [];
    return d.prepare("SELECT id, created, project, symptom, solution, state FROM bugs WHERE project = ? ORDER BY created DESC LIMIT 20").all(project) as Bug[];
  }

  function getLatestAnatomy(): Entry | null {
    const d = ensureDb();
    if (!d) return null;
    return (d.prepare("SELECT id, created, scope, project, category, headline, detail, labels FROM entries WHERE category = 'anatomy' AND project = ? ORDER BY created DESC LIMIT 1").get(currentProject) as Entry | undefined) || null;
  }

  // ---- Aging (Phase 3.3) ----

  function pruneStale(): { entries: number; bugs: number } {
    const d = ensureDb();
    if (!d) return { entries: 0, bugs: 0 };
    const cutoffCorrections = Math.floor(Date.now() / 1000) - 86400 * 90;
    const cutoffClosedBugs = Math.floor(Date.now() / 1000) - 86400 * 30;
    const ec = d.prepare(
      "DELETE FROM entries WHERE category = 'correction' AND created < ?"
    ).run(cutoffCorrections);
    const bc = d.prepare(
      "DELETE FROM bugs WHERE state IN ('fixed','wontfix','duplicate') AND created < ?"
    ).run(cutoffClosedBugs);
    if (ec.changes > 0 || bc.changes > 0) checkpoint();
    return { entries: ec.changes, bugs: bc.changes };
  }

  function prunePreview(): {
    entries: { id: number; created: number; headline: string }[];
    bugs: { id: number; created: number; symptom: string }[];
  } {
    const d = ensureDb();
    if (!d) return { entries: [], bugs: [] };
    const cutoffCorrections = Math.floor(Date.now() / 1000) - 86400 * 90;
    const cutoffClosedBugs = Math.floor(Date.now() / 1000) - 86400 * 30;
    const entries = d.prepare(
      "SELECT id, created, headline FROM entries WHERE category = 'correction' AND created < ?"
    ).all(cutoffCorrections) as { id: number; created: number; headline: string }[];
    const bugs = d.prepare(
      "SELECT id, created, symptom FROM bugs WHERE state IN ('fixed','wontfix','duplicate') AND created < ?"
    ).all(cutoffClosedBugs) as { id: number; created: number; symptom: string }[];
    return { entries, bugs };
  }

  // -------------------------------------------------------------------------
  // Wire up tools & commands
  // -------------------------------------------------------------------------

  const ctx = {
    ensureDb,
    checkpoint,
    scopeProject,
    get currentProject() { return currentProject; },
    memoryMode,
    search,
    save,
    saveBug,
    listBugs,
    scanAnatomy,
    anatomyToMarkdown,
    dbPath,
    DatabaseSync,
    sqliteLoadError,
    pruneStale,
    prunePreview,
  };

  registerTools(pi, ctx);
  registerCommands(pi, ctx);

  // -------------------------------------------------------------------------
  // Lifecycle hooks
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, c) => {
    currentProject = detectProject(c.cwd);
    if (!DatabaseSync) { c.ui.setStatus("lntrx-memory", "mem off"); return; }
    const d = ensureDb();
    const mode = memoryMode();
    c.ui.setStatus("lntrx-memory", d ? `mem (${mode})` : "mem off");

    // Aging: prune stale corrections (>90d) and closed bugs (>30d) each session
    const pruned = pruneStale();
    if (pruned.entries > 0 || pruned.bugs > 0) {
      const parts: string[] = [];
      if (pruned.entries > 0) parts.push(`${pruned.entries} old corrections`);
      if (pruned.bugs > 0) parts.push(`${pruned.bugs} closed bugs`);
      c.ui.notify(`lntrx-memory: Pruned ${parts.join(" and ")}.`, "info");
    }

    const last = getLatestAnatomy();
    if (!last || (Date.now() / 1000 - last.created) > 86400) {
      const result = scanAnatomy(currentProject);
      const md = anatomyToMarkdown(currentProject, result);
      const d2 = ensureDb();
      if (d2) {
        d2.prepare("DELETE FROM entries WHERE category = 'anatomy' AND project = ?").run(currentProject);
        save({ category: "anatomy", headline: `Project anatomy: ${result.files} files, ${result.tokens.toLocaleString()} tokens`, detail: md.slice(0, 8000), scope: "project" });
      }
    }

    const anatomy = getLatestAnatomy();
    if (anatomy) {
      pi.sendMessage({ customType: "lntrx-memory-anatomy", content: anatomy.detail.slice(0, 2000), display: false });
    }
  });

  pi.on("before_agent_start", async (event) => {
    currentProject = detectProject(event.systemPromptOptions.cwd || process.cwd());
    const prompt = event.prompt?.trim() || "";
    if (!prompt) return;

    const mode = memoryMode();

    // Always inject: TOOL_GUIDANCE, search hint, open bugs, anatomy
    const guidanceBlock = [TOOL_GUIDANCE, SEARCH_HINT].join("\n");

    // Search results only in "inject" mode (saves ~90% token overhead in default "policy")
    let recallBlock = "";
    if (mode === "inject") {
      const rows = search(prompt, 5, "project");
      if (rows.length) {
        recallBlock = ["Relevant local memory:", formatEntries(rows)].join("\n");
      }
    }

    const openBugs = listBugs(currentProject).filter(b => b.state === "open").slice(0, 3);
    const bugBlock = openBugs.length
      ? ["\nOpen bugs:", ...openBugs.map(b => `  #${b.id} ${b.symptom.slice(0, 100)} -> ${b.solution.slice(0, 100)}`)].join("\n")
      : "";

    return { systemPrompt: [event.systemPrompt, guidanceBlock, recallBlock, bugBlock].filter(Boolean).join("\n\n") };
  });

  pi.on("agent_end", async (event) => {
    if (!ensureDb()) return;
    const text = getLastAssistantText(event.messages as unknown[]);
    if (!text) return;
    for (const b of parseRememberBlocks(text)) {
      save({ headline: b.headline, detail: b.detail, category: b.category, labels: b.labels, scope: b.scope });
    }
  });

  pi.on("message_end", async (e) => {
    if (e.message.role !== "assistant") return;
    const c = e.message.content;
    const text = typeof c === "string" ? c.slice(-500)
      : Array.isArray(c) ? c.filter((p: any) => p?.type === "text").map((p: any) => p.text).join(" ") : "";
    setLastAssistantTextBuffer(text);
  });

  pi.on("message_start", async (e) => {
    if (e.message.role !== "user") return;
    const prev = getLastAssistantTextBuffer();
    if (!prev) return;
    const t = typeof e.message.content === "string" ? e.message.content
      : Array.isArray(e.message.content) ? e.message.content.filter((p: any) => p?.type === "text").map((p: any) => p.text).join(" ") : "";
    if (isCorrection(t)) {
      const summary = t.replace(/\n/g, " ").slice(0, 200);
      save({ category: "correction", headline: `Correction: ${summary}`, detail: `User corrected the assistant.\n\nUser: ${summary}\n\nAssistant: ${prev.slice(0, 500)}`, scope: "project" });
      // Only create a bug when the correction contains a recognizable error pattern
      if (hasErrorPattern(t)) {
        saveBug(summary, prev.slice(0, 500));
      }
    }
  });

  // ---- Flush hooks (Phase 3.5) ----

  pi.on("session_before_compact", async (_event, c) => {
    if (!ensureDb()) return;
    const d = ensureDb();
    if (!d) return;
    try { d.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* best-effort */ }
    const total = (d.prepare("SELECT COUNT(*) AS n FROM entries").get() as { n: number }).n;
    c.ui.notify(`lntrx-memory: Flushed ${total} entries before context compaction.`, "info");
  });

  pi.on("session_shutdown", async () => {
    if (!ensureDb()) return;
    const d = ensureDb();
    if (!d) return;
    try { d.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* best-effort */ }
  });

  pi.on("turn_end", async (_event, c) => {
    const p = getProject(currentProject, "lntrx-memory.reviewInterval");
    const g = get("lntrx-memory.reviewInterval");
    const interval = (typeof p === "number" ? p : typeof g === "number" ? g : 0) as number;
    if (interval <= 0) return;
    const turnIndex = (_event as any).turnIndex as number;
    if (!turnIndex || turnIndex % interval !== 0) return;
    c.ui.notify(`lntrx-memory: Turn ${turnIndex} — consider /memory scan.`, "info");
  });
}