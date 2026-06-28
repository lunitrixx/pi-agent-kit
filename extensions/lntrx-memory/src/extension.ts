/**
 * lntrx-memory - cross-session memory for pi with SQLite + FTS5.
 *
 * Features: FTS5 full-text search, project anatomy scanner, structured
 * buglog, correction detection, and <remember> block auto-capture.
 *
 * - Storage: single SQLite file at ~/.pi/memory.db
 * - Project-scoped by default; scope="global" for cross-project memories.
 * - Requires Node 24+ (stable node:sqlite).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  defaultDbPath,
  detectProject,
  GLOBAL_SCOPE,
  openDb,
  DatabaseSync,
  sqliteLoadError,
} from "./db.js";
import type { SqliteDB, Entry, Bug } from "./db.js";
import { loadIgnorePatterns, scanAnatomy, anatomyToMarkdown } from "./scanner.js";
import {
  getText,
  getLastAssistantText,
  toFtsQuery,
  formatEntries,
  parseRememberBlocks,
  getLastAssistantTextBuffer,
  setLastAssistantTextBuffer,
  isCorrection,
} from "./text.js";

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

  /** Merge WAL back into the main database and truncate the WAL file. */
  function checkpoint(): void {
    const d = ensureDb();
    if (!d) return;
    try {
      d.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch { /* best-effort */ }
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
      scope === "all"
        ? ""
        : scope === "global"
          ? "AND e.scope = 'global'"
          : "AND (e.project = ? OR e.scope = 'global')";
    const params: unknown[] = [];
    let sql: string;
    if (fts) {
      sql = `
        SELECT e.id, e.created, e.scope, e.project, e.category, e.headline, e.detail, e.labels
        FROM entries_idx f
        JOIN entries e ON e.id = f.rowid
        WHERE entries_idx MATCH ? ${scopeFilter}
        ORDER BY rank, e.created DESC
        LIMIT ?
      `;
      params.push(fts);
    } else {
      sql = `
        SELECT id, created, scope, project, category, headline, detail, labels
        FROM entries e
        WHERE 1=1 ${scopeFilter}
        ORDER BY created DESC
        LIMIT ?
      `;
    }
    if (scope !== "all") params.push(currentProject);
    params.push(limit);
    try {
      return d.prepare(sql).all(...params) as Entry[];
    } catch {
      if (!fts) return [];
      try {
        const fb: unknown[] = [];
        if (scope !== "all") fb.push(currentProject);
        fb.push(limit);
        return d
          .prepare(
            `SELECT id, created, scope, project, category, headline, detail, labels FROM entries e WHERE 1=1 ${scopeFilter} ORDER BY created DESC LIMIT ?`,
          )
          .all(...fb) as Entry[];
      } catch {
        return [];
      }
    }
  }

  function save(args: {
    headline: string;
    detail?: string;
    category?: string;
    labels?: string;
    scope?: "project" | "global";
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
    const res = d
      .prepare(
        "INSERT INTO entries(created, scope, project, category, headline, detail, labels) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(entry.created, entry.scope, entry.project, entry.category, entry.headline, entry.detail, entry.labels);
    checkpoint();
    return { id: Number(res.lastInsertRowid), ...entry };
  }

  function forgetById(id: number): boolean {
    const d = ensureDb();
    if (!d) return false;
    const res = d.prepare("DELETE FROM entries WHERE id = ?").run(id);
    if (res.changes > 0) checkpoint();
    return res.changes > 0;
  }

  // ---- Buglog ----

  function saveBug(symptom: string, solution: string): Bug | null {
    const d = ensureDb();
    if (!d) return null;
    const res = d
      .prepare("INSERT INTO bugs(created, project, symptom, solution) VALUES (unixepoch(), ?, ?, ?)")
      .run(currentProject, symptom.slice(0, 2000), solution.slice(0, 2000));
    checkpoint();
    return {
      id: Number(res.lastInsertRowid),
      created: Math.floor(Date.now() / 1000),
      project: currentProject,
      symptom,
      solution,
      state: "open",
    };
  }

  function listBugs(project: string): Bug[] {
    const d = ensureDb();
    if (!d) return [];
    return d
      .prepare("SELECT id, created, project, symptom, solution, state FROM bugs WHERE project = ? ORDER BY created DESC LIMIT 20")
      .all(project) as Bug[];
  }

  // ---- Anatomy ----

  function getLatestAnatomy(): Entry | null {
    const d = ensureDb();
    if (!d) return null;
    return (
      (d
        .prepare("SELECT id, created, scope, project, category, headline, detail, labels FROM entries WHERE category = 'anatomy' AND project = ? ORDER BY created DESC LIMIT 1")
        .get(currentProject) as Entry | undefined) || null
    );
  }

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  pi.registerTool({
    name: "lntrx_memory_search",
    label: "Memory Search",
    description:
      "Search local cross-session memory for prior decisions, conventions, bugs, and preferences. Project-scoped by default.",
    promptSnippet: "Check memory before implementing",
    parameters: Type.Object({
      query: Type.String({ description: "Free-text query (FTS5 with prefix matching)" }),
      limit: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 20, default: 5, description: "Maximum results" }),
      ),
      scope: Type.Optional(
        Type.Union([Type.Literal("project"), Type.Literal("global"), Type.Literal("all")], {
          description: "project = current project + global (default), global = only global, all = everything",
          default: "project",
        }),
      ),
    }),
    async execute(_id, params) {
      const limit = params.limit ?? 5;
      const scope = (params.scope ?? "project") as "project" | "global" | "all";
      const rows = search(params.query, limit, scope);
      return {
        content: [{ type: "text", text: formatEntries(rows) }],
        details: { query: params.query, scope, count: rows.length, results: rows },
      };
    },
  });

  pi.registerTool({
    name: "lntrx_memory_learn",
    label: "Memory Learn",
    description:
      "Save or update a durable note in local memory. Pass an existing id to update instead of creating new. Scoped to the current project unless scope=\"global\".",
    promptSnippet: "Record or update what you just learned",
    parameters: Type.Object({
      headline: Type.Optional(Type.String({ description: "Short title / headline" })),
      detail: Type.Optional(Type.String({ description: "Longer explanation" })),
      category: Type.Optional(
        Type.String({ description: "note | decision | convention | preference | bug (default: note)" }),
      ),
      labels: Type.Optional(Type.String({ description: "Comma-separated tags" })),
      scope: Type.Optional(
        Type.Union([Type.Literal("project"), Type.Literal("global")], {
          description: "project (default) or global",
        }),
      ),
      id: Type.Optional(Type.Integer({ description: "Existing entry id to update instead of creating new" })),
      text: Type.Optional(
        Type.String({ description: "Alias for headline: [Context] -> [What you learned]" }),
      ),
    }),
    async execute(_id, params) {
      let headline = params.headline || "";
      let detail = params.detail || "";
      let category = params.category || "note";

      if (params.text && !headline) {
        headline = params.text.slice(0, 500);
      }

      if (params.id) {
        const d = ensureDb();
        if (!d) {
          return { content: [{ type: "text", text: "Database unavailable." }], details: { ok: false } };
        }
        const changes: string[] = [];
        const vals: unknown[] = [];
        if (headline) { changes.push("headline = ?"); vals.push(headline.slice(0, 500)); }
        if (detail) { changes.push("detail = ?"); vals.push(detail.slice(0, 8000)); }
        if (params.category) { changes.push("category = ?"); vals.push(params.category); }
        if (params.labels !== undefined) { changes.push("labels = ?"); vals.push(params.labels); }
        if (params.scope) { changes.push("scope = ?"); vals.push(params.scope); changes.push("project = ?"); vals.push(scopeProject(params.scope)); }
        if (changes.length === 0) {
          return { content: [{ type: "text", text: "Nothing to update." }], details: { ok: false } };
        }
        vals.push(params.id);
        const res = d.prepare(`UPDATE entries SET ${changes.join(", ")} WHERE id = ?`).run(...vals);
        if (res.changes > 0) checkpoint();
        return {
          content: [{ type: "text", text: res.changes > 0 ? `Entry #${params.id} updated.` : `Entry #${params.id} not found.` }],
          details: { ok: res.changes > 0 },
        };
      }

      if (!headline) {
        return {
          content: [{ type: "text", text: "Headline is required for new entries." }],
          details: { ok: false },
        };
      }

      const row = save({ headline, detail, category, labels: params.labels, scope: params.scope });
      if (!row) {
        return {
          content: [{ type: "text", text: "Failed to save (db unavailable)." }],
          details: { ok: false },
        };
      }
      return {
        content: [{ type: "text", text: `Saved #${row.id} (${row.category}, ${row.scope === "global" ? "global" : "project"}): ${row.headline}` }],
        details: { ok: true, row },
      };
    },
  });

  // ---- Anatomy helper ----

  function runAnatomyScan(): Entry | null {
    const d = ensureDb();
    if (!d) return null;
    const result = scanAnatomy(currentProject);
    const md = anatomyToMarkdown(currentProject, result);
    d.prepare("DELETE FROM entries WHERE category = 'anatomy' AND project = ?").run(currentProject);
    const saved = save({
      category: "anatomy",
      headline: `Project anatomy: ${result.files} files, ${result.tokens.toLocaleString()} tokens`,
      detail: md.slice(0, 8000),
      scope: "project",
    });
    checkpoint();
    return saved;
  }

  pi.registerTool({
    name: "lntrx_memory_forget",
    label: "Memory Forget",
    description: "Delete a memory entry, bug, or anatomy by id.",
    promptSnippet: "Delete a memory entry",
    parameters: Type.Object({
      id: Type.Integer({ description: "Entry or bug id to delete" }),
      table: Type.Optional(
        Type.Union([Type.Literal("entries"), Type.Literal("bugs")], {
          description: "Which table: entries (default) or bugs",
          default: "entries",
        }),
      ),
    }),
    async execute(_id, params) {
      const d = ensureDb();
      if (!d) {
        return { content: [{ type: "text", text: "Database unavailable." }], details: { ok: false } };
      }
      const table = params.table || "entries";
      const res = d.prepare(`DELETE FROM ${table} WHERE id = ?`).run(params.id);
      const ok = res.changes > 0;
      if (ok) checkpoint();
      return {
        content: [{ type: "text", text: ok ? `${table === "entries" ? "Entry" : "Bug"} #${params.id} deleted.` : `#${params.id} not found in ${table}.` }],
        details: { ok },
      };
    },
  });

  pi.registerTool({
    name: "lntrx_memory_scan",
    label: "Memory Scan",
    description: "Scan the current project and store an anatomy map in memory.",
    promptSnippet: "Scan project anatomy",
    parameters: Type.Object({}),
    async execute() {
      const row = runAnatomyScan();
      if (!row) {
        return { content: [{ type: "text", text: "Scan failed (db unavailable)." }], details: { ok: false } };
      }
      return {
        content: [{ type: "text", text: `Scan complete: #${row.id} - ${row.headline}` }],
        details: { ok: true, id: row.id },
      };
    },
  });

  pi.registerTool({
    name: "lntrx_memory_bug",
    label: "Memory Bug",
    description: "Save a bug report or update its state. Use after finding or fixing a bug.",
    promptSnippet: "Track or update a bug",
    parameters: Type.Object({
      symptom: Type.String({ description: "What went wrong" }),
      solution: Type.Optional(Type.String({ description: "How it was fixed (leave empty if unresolved)" })),
      state: Type.Optional(
        Type.Union([Type.Literal("open"), Type.Literal("fixed"), Type.Literal("wontfix"), Type.Literal("duplicate")], {
          description: "Bug state",
          default: "open",
        }),
      ),
      id: Type.Optional(Type.Integer({ description: "Existing bug id to update instead of creating new" })),
    }),
    async execute(_id, params) {
      const d = ensureDb();
      if (!d) {
        return { content: [{ type: "text", text: "Database unavailable." }], details: { ok: false } };
      }

      if (params.id) {
        const changes: string[] = [];
        const vals: unknown[] = [];
        if (params.state) { changes.push("state = ?"); vals.push(params.state); }
        if (params.solution) { changes.push("solution = ?"); vals.push(params.solution); }
        if (params.symptom) { changes.push("symptom = ?"); vals.push(params.symptom); }
        if (changes.length === 0) {
          return { content: [{ type: "text", text: "Nothing to update." }], details: { ok: false } };
        }
        vals.push(params.id);
        d.prepare(`UPDATE bugs SET ${changes.join(", ")} WHERE id = ?`).run(...vals);
        checkpoint();
        return {
          content: [{ type: "text", text: `Bug #${params.id} updated.` }],
          details: { ok: true },
        };
      }

      const bug = saveBug(params.symptom, params.solution || "");
      if (!bug) {
        return { content: [{ type: "text", text: "Failed to save bug." }], details: { ok: false } };
      }
      return {
        content: [{ type: "text", text: `Bug #${bug.id} saved (open): ${bug.symptom.slice(0, 80)}` }],
        details: { ok: true, id: bug.id },
      };
    },
  });

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  pi.registerCommand("memory", {
    description: "Memory: search|learn|forget|scan|bug|bugs|health [<args>]",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0];
      const rest = parts.slice(1).join(" ");

      if (!sub || sub === "status" || sub === "health") {
        if (!DatabaseSync) {
          ctx.ui.notify(`lntrx-memory unavailable: ${sqliteLoadError}`, "error");
          return;
        }
        const d = ensureDb();
        if (!d) { ctx.ui.notify(`Failed to open ${dbPath}`, "error"); return; }
        const total = (d.prepare("SELECT COUNT(*) AS n FROM entries").get() as { n: number }).n;
        const inProject = (d.prepare("SELECT COUNT(*) AS n FROM entries WHERE project = ?").get(currentProject) as { n: number }).n;
        const openBugs = (d.prepare("SELECT COUNT(*) AS n FROM bugs WHERE project = ? AND state = 'open'").get(currentProject) as { n: number }).n;
        ctx.ui.notify(`lntrx-memory: ${total} entries (${inProject} here) - ${openBugs} open bugs`, "info");
        return;
      }

      if (sub === "search") {
        if (!rest) { ctx.ui.notify("/memory search <query>", "warning"); return; }
        const rows = search(rest, 10, "project");
        ctx.ui.notify(formatEntries(rows) || "No matches.", "info");
        return;
      }

      if (sub === "learn") {
        if (!rest) { ctx.ui.notify("/memory learn <text>", "warning"); return; }
        const row = save({ headline: rest.slice(0, 500) });
        ctx.ui.notify(row ? `#${row.id} saved.` : "DB unavailable.", row ? "success" : "error");
        return;
      }

      if (sub === "forget") {
        const id = parseInt(parts[1], 10);
        const table = parts[2] === "bug" ? "bugs" : "entries";
        if (isNaN(id)) { ctx.ui.notify("/memory forget <id> [bug]", "warning"); return; }
        const d = ensureDb();
        if (!d) { ctx.ui.notify("DB unavailable.", "error"); return; }
        const res = d.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        const ok = res.changes > 0;
        if (ok) checkpoint();
        ctx.ui.notify(ok ? `${table === "bugs" ? "Bug" : "Entry"} #${id} deleted.` : `#${id} not found.`, ok ? "success" : "error");
        return;
      }

      if (sub === "scan") {
        ctx.ui.notify("Scanning anatomy...", "info");
        const d = ensureDb();
        if (!d) { ctx.ui.notify("DB unavailable.", "error"); return; }
        const result = scanAnatomy(currentProject);
        const md = anatomyToMarkdown(currentProject, result);
        d.prepare("DELETE FROM entries WHERE category = 'anatomy' AND project = ?").run(currentProject);
        save({ category: "anatomy", headline: `Anatomy: ${result.files} files`, detail: md, scope: "project" });
        checkpoint();
        ctx.ui.notify(`Anatomy: ${result.files} files, ${result.tokens.toLocaleString()} tokens.`, "success");
        return;
      }

      if (sub === "bugs") {
        const bugs = listBugs(currentProject);
        if (!bugs.length) { ctx.ui.notify("No bugs recorded.", "info"); return; }
        const lines = bugs.map(
          (b) => `#${b.id} [${b.state}] ${b.symptom.slice(0, 80)}${b.solution ? ` -> ${b.solution.slice(0, 80)}` : ""}`,
        );
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (sub === "bug") {
        const action = parts[1];
        if (action === "add" || action === "new") {
          const symptom = parts.slice(2).join(" ");
          if (!symptom) { ctx.ui.notify("/memory bug add <symptom>", "warning"); return; }
          const bug = saveBug(symptom, "");
          ctx.ui.notify(bug ? `Bug #${bug.id} saved.` : "DB unavailable.", bug ? "success" : "error");
          return;
        }
        if (action === "fix") {
          const id = parseInt(parts[2], 10);
          const fix = parts.slice(3).join(" ");
          if (isNaN(id)) { ctx.ui.notify("/memory bug fix <id> <solution>", "warning"); return; }
          const d = ensureDb();
          if (!d) { ctx.ui.notify("DB unavailable.", "error"); return; }
          d.prepare("UPDATE bugs SET state = 'fixed', solution = ? WHERE id = ?").run(fix || "Fixed", id);
          checkpoint();
          ctx.ui.notify(`Bug #${id} marked fixed.`, "success");
          return;
        }
        if (action === "close") {
          const id = parseInt(parts[2], 10);
          if (isNaN(id)) { ctx.ui.notify("/memory bug close <id>", "warning"); return; }
          const d = ensureDb();
          if (!d) { ctx.ui.notify("DB unavailable.", "error"); return; }
          d.prepare("UPDATE bugs SET state = 'fixed' WHERE id = ?").run(id);
          checkpoint();
          ctx.ui.notify(`Bug #${id} closed.`, "success");
          return;
        }
        if (action === "delete" || action === "del") {
          const id = parseInt(parts[2], 10);
          if (isNaN(id)) { ctx.ui.notify("/memory bug delete <id>", "warning"); return; }
          const d = ensureDb();
          if (!d) { ctx.ui.notify("DB unavailable.", "error"); return; }
          const res = d.prepare("DELETE FROM bugs WHERE id = ?").run(id);
          if (res.changes > 0) checkpoint();
          ctx.ui.notify(res.changes > 0 ? `Bug #${id} deleted.` : `#${id} not found.`, res.changes > 0 ? "success" : "error");
          return;
        }
        ctx.ui.notify("/memory bug add|fix|close|delete", "info");
        return;
      }

      ctx.ui.notify("/memory search|learn|forget|scan|bug add|fix|close|delete|bugs|health", "info");
    },
  });

  // ---------------------------------------------------------------------------
  // Lifecycle hooks
  // ---------------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    currentProject = detectProject(ctx.cwd);
    if (!DatabaseSync) {
      ctx.ui.setStatus("lntrx-memory", "mem off");
      return;
    }
    const d = ensureDb();
    ctx.ui.setStatus("lntrx-memory", d ? "mem" : "mem off");

    const last = getLatestAnatomy();
    const stale = !last || (Date.now() / 1000 - last.created) > 86400;
    if (stale) {
      runAnatomyScan();
    }

    const anatomy = getLatestAnatomy();
    if (anatomy) {
      pi.sendMessage({
        customType: "lntrx-memory-anatomy",
        content: anatomy.detail.slice(0, 2000),
        display: false,
      });
    }
  });

  pi.on("before_agent_start", async (event) => {
    currentProject = detectProject(event.systemPromptOptions.cwd || process.cwd());
    const prompt = event.prompt?.trim() || "";
    if (!prompt) return;

    const rows = search(prompt, 5, "project");
    const recallBlock = rows.length
      ? ["Relevant local memory:", formatEntries(rows)].join("\n")
      : "";

    const openBugs = listBugs(currentProject).filter((b) => b.state === "open").slice(0, 3);
    const bugBlock = openBugs.length
      ? ["\nOpen bugs:", ...openBugs.map((b) => `  #${b.id} ${b.symptom.slice(0, 100)} -> ${b.solution.slice(0, 100)}`)].join("\n")
      : "";

    return {
      systemPrompt: [event.systemPrompt, TOOL_GUIDANCE, recallBlock, bugBlock]
        .filter(Boolean)
        .join("\n\n"),
    };
  });

  pi.on("agent_end", async (event) => {
    if (!ensureDb()) return;
    const text = getLastAssistantText(event.messages as unknown[]);
    if (!text) return;

    const blocks = parseRememberBlocks(text);
    for (const b of blocks) {
      save({
        headline: b.headline,
        detail: b.detail,
        category: b.category,
        labels: b.labels,
        scope: b.scope,
      });
    }
  });

  pi.on("message_end", async (e) => {
    if (e.message.role !== "assistant") return;
    const c = e.message.content;
    const text =
      typeof c === "string"
        ? c.slice(-500)
        : Array.isArray(c)
          ? c.filter((p: any) => p?.type === "text").map((p: any) => p.text).join(" ")
          : "";
    setLastAssistantTextBuffer(text);
  });

  pi.on("message_start", async (e) => {
    if (e.message.role !== "user") return;
    const prev = getLastAssistantTextBuffer();
    if (!prev) return;
    const t =
      typeof e.message.content === "string"
        ? e.message.content
        : Array.isArray(e.message.content)
          ? e.message.content.filter((p: any) => p?.type === "text").map((p: any) => p.text).join(" ")
          : "";
    if (isCorrection(t)) {
      const summary = t.replace(/\n/g, " ").slice(0, 200);
      save({
        category: "correction",
        headline: `Correction: ${summary}`,
        detail: `User corrected the assistant.\n\nUser: ${summary}\n\nAssistant: ${prev.slice(0, 500)}`,
        scope: "project",
      });
      saveBug(summary, "Auto-detected - needs review");
    }
  });
}
