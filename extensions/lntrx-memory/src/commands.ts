/**
 * lntrx-memory - command registration
 *
 * Registers the /memory command with all subcommands.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Entry, Bug } from "./db.js";
import { formatEntries } from "./text.js";

export interface CmdCtx {
  dbPath: string;
  currentProject: string;
  DatabaseSync: unknown | null;
  sqliteLoadError: string | null;
  ensureDb(): import("./db.js").SqliteDB | null;
  checkpoint(): void;
  search(query: string, limit: number, scope: "project" | "global" | "all"): Entry[];
  save(args: {
    headline: string;
    detail?: string;
    category?: string;
    labels?: string;
    scope?: "project" | "global";
  }): Entry | null;
  saveBug(symptom: string, solution: string): Bug | null;
  listBugs(project: string): Bug[];
  scanAnatomy(root: string): ReturnType<typeof import("./scanner.js").scanAnatomy>;
  anatomyToMarkdown(root: string, result: ReturnType<typeof import("./scanner.js").scanAnatomy>): string;
}

export function registerCommands(pi: ExtensionAPI, ctx: CmdCtx) {
  pi.registerCommand("memory", {
    description: "Memory: list|search|learn|forget|scan|bug|bugs|health [<args>]",
    handler: async (args, c) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0];
      const rest = parts.slice(1).join(" ");

      // ---- health / status ----
      if (!sub || sub === "status" || sub === "health") {
        if (!ctx.DatabaseSync) {
          c.ui.notify(`lntrx-memory unavailable: ${ctx.sqliteLoadError}`, "error");
          return;
        }
        const d = ctx.ensureDb();
        if (!d) { c.ui.notify(`Failed to open ${ctx.dbPath}`, "error"); return; }
        const total = (d.prepare("SELECT COUNT(*) AS n FROM entries").get() as { n: number }).n;
        const inProject = (d.prepare("SELECT COUNT(*) AS n FROM entries WHERE project = ?").get(ctx.currentProject) as { n: number }).n;
        const openBugs = (d.prepare("SELECT COUNT(*) AS n FROM bugs WHERE project = ? AND state = 'open'").get(ctx.currentProject) as { n: number }).n;
        c.ui.notify(`lntrx-memory: ${total} entries (${inProject} here) - ${openBugs} open bugs`, "info");
        return;
      }

      // ---- list / recent ----
      if (sub === "list" || sub === "ls" || sub === "recent") {
        const limit = Math.min(parseInt(parts[1], 10) || 10, 50);
        const d = ctx.ensureDb();
        if (!d) { c.ui.notify("DB unavailable.", "error"); return; }
        const rows = d.prepare(
          "SELECT id, created, scope, project, category, headline, detail, labels FROM entries WHERE project = ? ORDER BY created DESC LIMIT ?"
        ).all(ctx.currentProject, limit) as Entry[];
        c.ui.notify(rows.length ? formatEntries(rows) : "No entries yet.", "info");
        return;
      }

      // ---- search ----
      if (sub === "search") {
        if (!rest) { c.ui.notify("/memory search <query>", "warning"); return; }
        const rows = ctx.search(rest, 10, "project");
        c.ui.notify(formatEntries(rows) || "No matches.", "info");
        return;
      }

      // ---- learn ----
      if (sub === "learn") {
        if (!rest) { c.ui.notify("/memory learn <text>", "warning"); return; }
        const row = ctx.save({ headline: rest.slice(0, 500) });
        c.ui.notify(row ? `#${row.id} saved.` : "DB unavailable.", row ? "success" : "error");
        return;
      }

      // ---- forget ----
      if (sub === "forget") {
        const id = parseInt(parts[1], 10);
        const table = parts[2] === "bug" ? "bugs" : "entries";
        if (isNaN(id)) { c.ui.notify("/memory forget <id> [bug]", "warning"); return; }
        const d = ctx.ensureDb();
        if (!d) { c.ui.notify("DB unavailable.", "error"); return; }
        const res = d.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        const ok = res.changes > 0;
        if (ok) ctx.checkpoint();
        c.ui.notify(ok ? `${table === "bugs" ? "Bug" : "Entry"} #${id} deleted.` : `#${id} not found.`, ok ? "success" : "error");
        return;
      }

      // ---- scan ----
      if (sub === "scan") {
        c.ui.notify("Scanning anatomy...", "info");
        const d = ctx.ensureDb();
        if (!d) { c.ui.notify("DB unavailable.", "error"); return; }
        const result = ctx.scanAnatomy(ctx.currentProject);
        const md = ctx.anatomyToMarkdown(ctx.currentProject, result);
        d.prepare("DELETE FROM entries WHERE category = 'anatomy' AND project = ?").run(ctx.currentProject);
        ctx.save({ category: "anatomy", headline: `Anatomy: ${result.files} files`, detail: md, scope: "project" });
        ctx.checkpoint();
        c.ui.notify(`Anatomy: ${result.files} files, ${result.tokens.toLocaleString()} tokens.`, "success");
        return;
      }

      // ---- bugs ----
      if (sub === "bugs") {
        const bugs = ctx.listBugs(ctx.currentProject);
        if (!bugs.length) { c.ui.notify("No bugs recorded.", "info"); return; }
        const lines = bugs.map(
          (b) => `#${b.id} [${b.state}] ${b.symptom.slice(0, 80)}${b.solution ? ` -> ${b.solution.slice(0, 80)}` : ""}`,
        );
        c.ui.notify(lines.join("\n"), "info");
        return;
      }

      // ---- bug ----
      if (sub === "bug") {
        const action = parts[1];
        if (action === "add" || action === "new") {
          const symptom = parts.slice(2).join(" ");
          if (!symptom) { c.ui.notify("/memory bug add <symptom>", "warning"); return; }
          const bug = ctx.saveBug(symptom, "");
          c.ui.notify(bug ? `Bug #${bug.id} saved.` : "DB unavailable.", bug ? "success" : "error");
          return;
        }
        if (action === "fix") {
          const id = parseInt(parts[2], 10);
          const fix = parts.slice(3).join(" ");
          if (isNaN(id)) { c.ui.notify("/memory bug fix <id> <solution>", "warning"); return; }
          const d = ctx.ensureDb();
          if (!d) { c.ui.notify("DB unavailable.", "error"); return; }
          d.prepare("UPDATE bugs SET state = 'fixed', solution = ? WHERE id = ?").run(fix || "Fixed", id);
          ctx.checkpoint();
          c.ui.notify(`Bug #${id} marked fixed.`, "success");
          return;
        }
        if (action === "close") {
          const id = parseInt(parts[2], 10);
          if (isNaN(id)) { c.ui.notify("/memory bug close <id>", "warning"); return; }
          const d = ctx.ensureDb();
          if (!d) { c.ui.notify("DB unavailable.", "error"); return; }
          d.prepare("UPDATE bugs SET state = 'fixed' WHERE id = ?").run(id);
          ctx.checkpoint();
          c.ui.notify(`Bug #${id} closed.`, "success");
          return;
        }
        if (action === "delete" || action === "del") {
          const id = parseInt(parts[2], 10);
          if (isNaN(id)) { c.ui.notify("/memory bug delete <id>", "warning"); return; }
          const d = ctx.ensureDb();
          if (!d) { c.ui.notify("DB unavailable.", "error"); return; }
          const res = d.prepare("DELETE FROM bugs WHERE id = ?").run(id);
          if (res.changes > 0) ctx.checkpoint();
          c.ui.notify(res.changes > 0 ? `Bug #${id} deleted.` : `#${id} not found.`, res.changes > 0 ? "success" : "error");
          return;
        }
        c.ui.notify("/memory bug add|fix|close|delete", "info");
        return;
      }

      c.ui.notify("/memory list|search|learn|forget|scan|bug add|fix|close|delete|bugs|health", "info");
    },
  });
}
