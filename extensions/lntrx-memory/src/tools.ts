/**
 * lntrx-memory - tool registrations
 *
 * Registers all lntrx_memory_* tools on the pi ExtensionAPI.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Entry, Bug } from "./db.js";
import { formatEntries } from "./text.js";

export interface MemoryCtx {
  ensureDb(): import("./db.js").SqliteDB | null;
  checkpoint(): void;
  scopeProject(scope: "project" | "global"): string;
  currentProject: string;
  search(query: string, limit: number, scope: "project" | "global" | "all"): Entry[];
  save(args: {
    headline: string;
    detail?: string;
    category?: string;
    labels?: string;
    scope?: "project" | "global";
  }): Entry | null;
  saveBug(symptom: string, solution: string): Bug | null;
  scanAnatomy(root: string): ReturnType<typeof import("./scanner.js").scanAnatomy>;
  anatomyToMarkdown(root: string, result: ReturnType<typeof import("./scanner.js").scanAnatomy>): string;
}

export function registerTools(pi: ExtensionAPI, ctx: MemoryCtx) {
  // ---- Anatomy helper ----

  function runAnatomyScan(): Entry | null {
    const d = ctx.ensureDb();
    if (!d) return null;
    const result = ctx.scanAnatomy(ctx.currentProject);
    const md = ctx.anatomyToMarkdown(ctx.currentProject, result);
    d.prepare("DELETE FROM entries WHERE category = 'anatomy' AND project = ?").run(ctx.currentProject);
    const saved = ctx.save({
      category: "anatomy",
      headline: `Project anatomy: ${result.files} files, ${result.tokens.toLocaleString()} tokens`,
      detail: md.slice(0, 8000),
      scope: "project",
    });
    ctx.checkpoint();
    return saved;
  }

  // -------------------------------------------------------------------------
  // lntrx_memory_search
  // -------------------------------------------------------------------------

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
      const rows = ctx.search(params.query, limit, scope);
      return {
        content: [{ type: "text", text: formatEntries(rows) }],
        details: { query: params.query, scope, count: rows.length, results: rows },
      };
    },
  });

  // -------------------------------------------------------------------------
  // lntrx_memory_learn
  // -------------------------------------------------------------------------

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
        const d = ctx.ensureDb();
        if (!d) {
          return { content: [{ type: "text", text: "Database unavailable." }], details: { ok: false } };
        }
        const changes: string[] = [];
        const vals: unknown[] = [];
        if (headline) { changes.push("headline = ?"); vals.push(headline.slice(0, 500)); }
        if (detail) { changes.push("detail = ?"); vals.push(detail.slice(0, 8000)); }
        if (params.category) { changes.push("category = ?"); vals.push(params.category); }
        if (params.labels !== undefined) { changes.push("labels = ?"); vals.push(params.labels); }
        if (params.scope) { changes.push("scope = ?"); vals.push(params.scope); changes.push("project = ?"); vals.push(ctx.scopeProject(params.scope)); }
        if (changes.length === 0) {
          return { content: [{ type: "text", text: "Nothing to update." }], details: { ok: false } };
        }
        vals.push(params.id);
        const res = d.prepare(`UPDATE entries SET ${changes.join(", ")} WHERE id = ?`).run(...vals);
        if (res.changes > 0) ctx.checkpoint();
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

      const row = ctx.save({ headline, detail, category, labels: params.labels, scope: params.scope });
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

  // -------------------------------------------------------------------------
  // lntrx_memory_forget
  // -------------------------------------------------------------------------

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
      const d = ctx.ensureDb();
      if (!d) {
        return { content: [{ type: "text", text: "Database unavailable." }], details: { ok: false } };
      }
      const table = params.table || "entries";
      const res = d.prepare(`DELETE FROM ${table} WHERE id = ?`).run(params.id);
      const ok = res.changes > 0;
      if (ok) ctx.checkpoint();
      return {
        content: [{ type: "text", text: ok ? `${table === "entries" ? "Entry" : "Bug"} #${params.id} deleted.` : `#${params.id} not found in ${table}.` }],
        details: { ok },
      };
    },
  });

  // -------------------------------------------------------------------------
  // lntrx_memory_scan
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // lntrx_memory_bug
  // -------------------------------------------------------------------------

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
      const d = ctx.ensureDb();
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
        ctx.checkpoint();
        return {
          content: [{ type: "text", text: `Bug #${params.id} updated.` }],
          details: { ok: true },
        };
      }

      const bug = ctx.saveBug(params.symptom, params.solution || "");
      if (!bug) {
        return { content: [{ type: "text", text: "Failed to save bug." }], details: { ok: false } };
      }
      return {
        content: [{ type: "text", text: `Bug #${bug.id} saved (open): ${bug.symptom.slice(0, 80)}` }],
        details: { ok: true, id: bug.id },
      };
    },
  });
}
