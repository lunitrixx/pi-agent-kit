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
} from "./text.js";
import { registerTools } from "./tools.js";
import { registerCommands } from "./commands.js";

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
      headline: args.headline.slice(0, 500),
      detail: (args.detail || "").slice(0, 8000),
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
      .run(currentProject, symptom.slice(0, 2000), solution.slice(0, 2000));
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

  // -------------------------------------------------------------------------
  // Wire up tools & commands
  // -------------------------------------------------------------------------

  const ctx = {
    ensureDb,
    checkpoint,
    scopeProject,
    get currentProject() { return currentProject; },
    search,
    save,
    saveBug,
    listBugs,
    scanAnatomy,
    anatomyToMarkdown,
    dbPath,
    DatabaseSync,
    sqliteLoadError,
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
    c.ui.setStatus("lntrx-memory", d ? "mem" : "mem off");

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

    const rows = search(prompt, 5, "project");
    const recallBlock = rows.length ? ["Relevant local memory:", formatEntries(rows)].join("\n") : "";

    const openBugs = listBugs(currentProject).filter(b => b.state === "open").slice(0, 3);
    const bugBlock = openBugs.length ? ["\nOpen bugs:", ...openBugs.map(b => `  #${b.id} ${b.symptom.slice(0, 100)} -> ${b.solution.slice(0, 100)}`)].join("\n") : "";

    return { systemPrompt: [event.systemPrompt, TOOL_GUIDANCE, recallBlock, bugBlock].filter(Boolean).join("\n\n") };
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
      saveBug(summary, "Auto-detected - needs review");
    }
  });
}
