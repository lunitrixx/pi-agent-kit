/**
 * lntrx-memory - cross-session memory for pi with SQLite + FTS5.
 *
 * Features: FTS5 full-text search, project anatomy scanner, structured
 * buglog, correction detection, and <remember> block auto-capture.
 *
 * - Storage: single SQLite file at XDG_DATA_HOME/pi/memory.db
 * - Project-scoped by default; scope="global" for cross-project memories.
 * - Requires Node 24+ (stable node:sqlite).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// SQLite loader
// ---------------------------------------------------------------------------

type SqliteDB = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...params: unknown[]) => { lastInsertRowid: number | bigint; changes: number };
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  close: () => void;
};

let DatabaseSync: { new (path: string): SqliteDB } | null = null;
let sqliteLoadError: string | null = null;

try {
  const suppressExperimental = (w: { name: string }) => {
    if (w.name === "ExperimentalWarning") return;
  };
  process.on("warning", suppressExperimental);
  ({ DatabaseSync } = require("node:sqlite") as { DatabaseSync: { new (p: string): SqliteDB } });
  process.off("warning", suppressExperimental);
} catch (err) {
  sqliteLoadError =
    (err as Error).message +
    " - lntrx-memory needs Node 24+ (stable node:sqlite).";
}

// ---------------------------------------------------------------------------
// Paths & project detection
// ---------------------------------------------------------------------------

export function defaultDbPath(): string {
  if (process.env.LNTRX_MEMORY_DB) return process.env.LNTRX_MEMORY_DB;
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(xdg, "pi", "memory.db");
}

export function detectProject(cwd: string): string {
  if (process.env.LNTRX_MEMORY_PROJECT) return process.env.LNTRX_MEMORY_PROJECT;
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (root) return root;
  } catch {
    /* not a git repo */
  }
  return cwd;
}

export const GLOBAL_SCOPE = "*";

// ---------------------------------------------------------------------------
// Database schema
// ---------------------------------------------------------------------------

export function openDb(dbPath: string): SqliteDB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync!(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS entries (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      created   INTEGER NOT NULL DEFAULT (unixepoch()),
      scope     TEXT    NOT NULL DEFAULT 'project'
                CHECK(scope IN ('project','global')),
      project   TEXT    NOT NULL DEFAULT '',
      category  TEXT    NOT NULL DEFAULT 'note'
                CHECK(category IN ('note','decision','convention','preference','bug','anatomy','correction')),
      headline  TEXT    NOT NULL,
      detail    TEXT    NOT NULL DEFAULT '',
      labels    TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project);
    CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);

    CREATE VIRTUAL TABLE IF NOT EXISTS entries_idx USING fts5(
      headline, detail, labels,
      content='entries', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS tr_entries_ins AFTER INSERT ON entries BEGIN
      INSERT INTO entries_idx(rowid, headline, detail, labels)
      VALUES (new.id, new.headline, new.detail, new.labels);
    END;
    CREATE TRIGGER IF NOT EXISTS tr_entries_del AFTER DELETE ON entries BEGIN
      INSERT INTO entries_idx(entries_idx, rowid, headline, detail, labels)
      VALUES ('delete', old.id, old.headline, old.detail, old.labels);
    END;
    CREATE TRIGGER IF NOT EXISTS tr_entries_upd AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_idx(entries_idx, rowid, headline, detail, labels)
      VALUES ('delete', old.id, old.headline, old.detail, old.labels);
      INSERT INTO entries_idx(rowid, headline, detail, labels)
      VALUES (new.id, new.headline, new.detail, new.labels);
    END;

    CREATE TABLE IF NOT EXISTS bugs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      created   INTEGER NOT NULL DEFAULT (unixepoch()),
      project   TEXT    NOT NULL,
      symptom   TEXT    NOT NULL,
      solution  TEXT    NOT NULL DEFAULT '',
      state     TEXT    NOT NULL DEFAULT 'open'
                CHECK(state IN ('open','fixed','wontfix','duplicate'))
    );
    CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project);
    CREATE INDEX IF NOT EXISTS idx_bugs_state ON bugs(state);
  `);
  return db;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Entry = {
  id: number;
  created: number;
  scope: "project" | "global";
  project: string;
  category: string;
  headline: string;
  detail: string;
  labels: string;
};

type Bug = {
  id: number;
  created: number;
  project: string;
  symptom: string;
  solution: string;
  state: "open" | "fixed" | "wontfix" | "duplicate";
};

type TextBlock = { type?: string; text?: string };
type AssistantMessage = { role?: string; content?: unknown };

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

export function getText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [] as string[];
      const block = part as TextBlock;
      if (block.type === "text" && typeof block.text === "string") return [block.text];
      return [] as string[];
    })
    .join("\n")
    .trim();
}

export function getLastAssistantText(messages: unknown[]): string {
  for (const msg of [...messages].reverse()) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as AssistantMessage;
    if (m.role !== "assistant") continue;
    const text = getText(m.content);
    if (text) return text;
  }
  return "";
}

// ---------------------------------------------------------------------------
// FTS5 query builder
// ---------------------------------------------------------------------------

/**
 * Build a safe FTS5 prefix query from free-form text.
 *
 * FTS5 treats '-' as column restriction, '"' as phrase start, and
 * various characters as syntax. We extract clean alphanumeric tokens,
 * drop single-char noise, quote each token, and prefix-match with AND.
 */
export function toFtsQuery(query: string): string {
  const raw = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  const terms: string[] = [];
  for (const t of raw) {
    if (t.length < 2) continue;
    if (t.match(/^(and|or|not|near|matchinfo)$/)) continue;
    terms.push(`"${t}"*`);
    if (terms.length >= 8) break;
  }

  return terms.length ? terms.join(" AND ") : "";
}

function formatEntries(entries: Entry[]): string {
  if (!entries.length) return "No relevant memories found.";
  return entries
    .map((e) => {
      const when = new Date(e.created * 1000).toISOString().slice(0, 10);
      const scope = e.scope === "global" ? "global" : path.basename(e.project);
      const tags = e.labels ? ` [${e.labels}]` : "";
      const detail = e.detail ? `\n  ${e.detail.replace(/\n/g, "\n  ")}` : "";
      return `#${e.id} ${when} (${e.category}, ${scope})${tags} ${e.headline}${detail}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// <remember> block parser
// ---------------------------------------------------------------------------

type ParsedRemember = {
  category: string;
  labels: string;
  scope: "project" | "global";
  headline: string;
  detail: string;
};

/**
 * Parse <remember> XML blocks from assistant response text.
 *
 * Attributes: category="...", labels="...", scope="project|global"
 * Body: headline line, optional --- separator, optional detail text.
 */
export function parseRememberBlocks(text: string): ParsedRemember[] {
  const results: ParsedRemember[] = [];
  const openTag = /<(remember)\b([^>]*)?>/gi;
  const closeTag = /<\/(remember)>/gi;

  let pos = 0;
  while (pos < text.length) {
    openTag.lastIndex = pos;
    const openMatch = openTag.exec(text);
    if (!openMatch) break;

    const attrs = openMatch[2] || "";
    const contentStart = openTag.lastIndex;

    closeTag.lastIndex = contentStart;
    const closeMatch = closeTag.exec(text);
    if (!closeMatch) break;

    const raw = text.slice(contentStart, closeMatch.index).trim();
    pos = closeTag.lastIndex;
    if (!raw) continue;

    // Parse attributes: key="value"
    const attrMap: Record<string, string> = {};
    for (const m of attrs.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"/g)) {
      attrMap[m[1].toLowerCase()] = m[2];
    }

    // Split headline from detail
    let headline: string;
    let detail: string;
    const sep = raw.indexOf("\n---\n");
    if (sep !== -1) {
      headline = raw.slice(0, sep).trim();
      detail = raw.slice(sep + 5).trim();
    } else {
      const nl = raw.indexOf("\n");
      if (nl === -1) {
        headline = raw;
        detail = "";
      } else {
        headline = raw.slice(0, nl).trim();
        detail = raw.slice(nl + 1).trim();
      }
    }

    if (!headline) continue;

    results.push({
      category: attrMap.category || attrMap.kind || "note",
      labels: attrMap.labels || attrMap.tags || "",
      scope: attrMap.scope === "global" ? "global" : "project",
      headline: headline.slice(0, 500),
      detail: detail.slice(0, 8000),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Correction detection
// ---------------------------------------------------------------------------

let lastAssistantText = "";

function isCorrection(text: string): boolean {
  return /\b(no|nein|falsch|wrong|incorrect|don'?t|nicht|stop)\b.*\b(use|do|nimm|mach|try|versuch|should|solltest)\b/i.test(text)
    || /\b(actually|eigentlich|rather|vielmehr|stattdessen|instead)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Anatomy scanner
// ---------------------------------------------------------------------------

const CODE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".c", ".h", ".cpp",
  ".lua", ".md", ".json", ".yaml", ".toml",
]);
const SCAN_IGNORE = new Set([
  ".git", "node_modules", ".pi", "dist", "build", "__pycache__", ".next", "target",
]);

function scanAnatomy(root: string): { files: number; tokens: number; byExt: Record<string, string[]> } {
  const entries: { path: string; ext: string; tokens: number }[] = [];
  function walk(dir: string) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (SCAN_IGNORE.has(f) || f.startsWith(".")) continue;
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        if (st.isDirectory()) { walk(full); continue; }
        const ext = path.extname(f).toLowerCase();
        if (!CODE_EXTS.has(ext)) continue;
        entries.push({
          path: path.relative(root, full),
          ext,
          tokens: Math.max(1, Math.ceil(st.size / 4)),
        });
      }
    } catch { /* permissions */ }
  }
  walk(root);

  const byExt: Record<string, string[]> = {};
  for (const e of entries) {
    if (!byExt[e.ext]) byExt[e.ext] = [];
    byExt[e.ext].push(e.path);
  }

  return {
    files: entries.length,
    tokens: entries.reduce((s, e) => s + e.tokens, 0),
    byExt,
  };
}

function anatomyToMarkdown(root: string, result: ReturnType<typeof scanAnatomy>): string {
  const lines = [
    "# Project Anatomy",
    "",
    `> ${result.files} files - ${result.tokens.toLocaleString()} estimated tokens`,
    `> Scanned ${new Date().toISOString().slice(0, 10)}`,
    "",
  ];
  for (const [ext, paths] of Object.entries(result.byExt).sort()) {
    lines.push(`## ${ext}`, ...paths.map((p) => `- \`${p}\``), "");
  }
  return lines.join("\n");
}

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
    return { id: Number(res.lastInsertRowid), ...entry };
  }

  function forgetById(id: number): boolean {
    const d = ensureDb();
    if (!d) return false;
    const res = d.prepare("DELETE FROM entries WHERE id = ?").run(id);
    return res.changes > 0;
  }

  // ---- Buglog ----

  function saveBug(symptom: string, solution: string): Bug | null {
    const d = ensureDb();
    if (!d) return null;
    const res = d
      .prepare("INSERT INTO bugs(created, project, symptom, solution) VALUES (unixepoch(), ?, ?, ?)")
      .run(currentProject, symptom.slice(0, 2000), solution.slice(0, 2000));
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
      // Backward compat with old lntrx_memory_learn signature
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

      // Update existing entry
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
        return {
          content: [{ type: "text", text: res.changes > 0 ? `Entry #${params.id} updated.` : `Entry #${params.id} not found.` }],
          details: { ok: res.changes > 0 },
        };
      }

      // Create new
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
        content: [
          {
            type: "text",
            text: `Saved #${row.id} (${row.category}, ${row.scope === "global" ? "global" : "project"}): ${row.headline}`,
          },
        ],
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
    return save({
      category: "anatomy",
      headline: `Project anatomy: ${result.files} files, ${result.tokens.toLocaleString()} tokens`,
      detail: md.slice(0, 8000),
      scope: "project",
    });
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

      // Update existing bug
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
        return {
          content: [{ type: "text", text: `Bug #${params.id} updated.` }],
          details: { ok: true },
        };
      }

      // Create new bug
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
          ctx.ui.notify(`Bug #${id} marked fixed.`, "success");
          return;
        }
        if (action === "close") {
          const id = parseInt(parts[2], 10);
          if (isNaN(id)) { ctx.ui.notify("/memory bug close <id>", "warning"); return; }
          const d = ensureDb();
          if (!d) { ctx.ui.notify("DB unavailable.", "error"); return; }
          d.prepare("UPDATE bugs SET state = 'fixed' WHERE id = ?").run(id);
          ctx.ui.notify(`Bug #${id} closed.`, "success");
          return;
        }
        if (action === "delete" || action === "del") {
          const id = parseInt(parts[2], 10);
          if (isNaN(id)) { ctx.ui.notify("/memory bug delete <id>", "warning"); return; }
          const d = ensureDb();
          if (!d) { ctx.ui.notify("DB unavailable.", "error"); return; }
          const res = d.prepare("DELETE FROM bugs WHERE id = ?").run(id);
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

    // Auto-scan anatomy if stale (>24h since last scan) or missing
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

  // Correction detection
  pi.on("message_end", async (e) => {
    if (e.message.role !== "assistant") return;
    const c = e.message.content;
    lastAssistantText =
      typeof c === "string"
        ? c.slice(-500)
        : Array.isArray(c)
          ? c.filter((p: any) => p?.type === "text").map((p: any) => p.text).join(" ")
          : "";
  });

  pi.on("message_start", async (e) => {
    if (e.message.role !== "user" || !lastAssistantText) return;
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
        detail: `User corrected the assistant.\n\nUser: ${summary}\n\nAssistant: ${lastAssistantText.slice(0, 500)}`,
        scope: "project",
      });
      saveBug(summary, "Auto-detected - needs review");
    }
  });
}
