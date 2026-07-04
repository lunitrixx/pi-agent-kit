/**
 * lntrx-memory v2 - file-based cross-session memory for pi
 *
 * Markdown files with YAML frontmatter. No database.
 * Core logic: store, search, index, staleness.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { detectProject, projectMemoryDir, globalMemoryDir, resolveDirs, ensureDirs } from "./paths.js";
import {
  listMemories,
  readMemory,
  saveMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
  readAnatomy,
  writeAnatomy,
} from "./store.js";
import type { MemoryFile, MemoryFrontmatter } from "./frontmatter.js";
import { scanAnatomy, anatomyToMarkdown } from "./scanner.js";
import { generateIndex, writeIndex, loadHotContext } from "./index.js";
import { freshnessWarning, formatStalenessReport } from "./stale.js";
import { loadConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

const TOOL_GUIDANCE = [
  "## lntrx-memory",
  "",
  "You have persistent file-based memory. Two scopes:",
  "- **Project**: `<project>/.pi/memory/` — codebase-specific (decisions, bugs, facts)",
  "- **Global**: `~/.pi/memory/` — cross-project (preferences, conventions about YOU)",
  "",
  "### Reading",
  "- `lntrx_memory_search` tool finds relevant memories.",
  "- `INDEX.md` (first 200 lines) is shown above as hot context.",
  "- Anatomy is shown at session start.",
  "",
  "### Writing (project scope by default)",
  "- Write directly to `.pi/memory/<category>/` as markdown with YAML frontmatter:",
  "  ```yaml",
  "  ---",
  "  created: 2026-07-04T12:00:00Z",
  "  category: decision|fact|bug|convention|correction|preference",
  "  source_refs:            # optional — files this memory references",
  "    - path/to/file.ts",
  "  ---",
  "  # Title",
  "  Body text.",
  "  ```",
  "- Or use `lntrx_memory_learn` convenience tool.",
  "- **Global scope**: Only when explicitly asked or when it's about YOU (language, style).",
  "  Write to `~/.pi/memory/` instead.",
  "",
  "### Cleanup",
  "- Run `/memory cleanup` to see broken (source deleted) and aging (>90d) entries.",
  "- **Never delete without asking.** Show the list and ask: 'Soll ich diese Einträge löschen?'",
  "- After user confirms, use `lntrx_memory_forget` or delete the files directly.",
  "- Merge duplicates. Run `/memory index` to regenerate INDEX.md.",
].join("\n");

export default function memoryExtension(pi: ExtensionAPI) {
  let currentProject = detectProject(process.cwd());
  let projectDir = projectMemoryDir(currentProject);
  let globalDir = globalMemoryDir();

  function getDirs(scope: "project" | "global" | "all"): string[] {
    return resolveDirs(currentProject, scope);
  }

  // -------------------------------------------------------------------------
  // Lifecycle hooks
  // -------------------------------------------------------------------------

  pi.on("session_start", async (_event, c) => {
    currentProject = detectProject(c.cwd);
    projectDir = projectMemoryDir(currentProject);
    globalDir = globalMemoryDir();

    // Ensure directories exist
    ensureDirs([projectDir, globalDir]);
    c.ui.setStatus("lntrx-memory", "mem");

    // Skip scan if detectProject fell back to cwd and there's no real project
    const isFallback = currentProject === c.cwd && !existsSync(join(c.cwd, ".git"));
    if (isFallback) {
      c.ui.setStatus("lntrx-memory", "mem (no project)");
    } else {
      const config = loadConfig(projectDir);
      const anatomyPath = join(projectDir, "anatomy.md");
      let shouldRescan = false;

      try {
        const st = statSync(anatomyPath);
        const ageDays = (Date.now() - st.mtimeMs) / (1000 * 60 * 60 * 24);
        if (ageDays >= config.anatomyRescanDays) shouldRescan = true;
      } catch {
        shouldRescan = true; // File doesn't exist
      }

      if (shouldRescan) {
        const result = scanAnatomy(currentProject);
        const md = anatomyToMarkdown(currentProject, result);
        writeAnatomy(projectDir, md);
      }

      // Regenerate INDEX.md
      const allMemories = listMemories(projectDir);
      const projectName = currentProject.split("/").pop() || "";
      writeIndex(projectDir, generateIndex(allMemories, projectName));
    }

    // Inject anatomy into context
    const anatomy = readAnatomy(projectDir);
    if (anatomy) {
      pi.sendMessage({
        customType: "lntrx-memory-anatomy",
        content: anatomy.slice(0, 2000),
        display: false,
      });
    }
  });

  pi.on("before_agent_start", async (event) => {
    currentProject = detectProject(event.systemPromptOptions?.cwd || process.cwd());
    projectDir = projectMemoryDir(currentProject);

    const prompt = event.prompt?.trim() || "";
    if (!prompt) {
      return { systemPrompt: [event.systemPrompt, TOOL_GUIDANCE].filter(Boolean).join("\n\n") };
    }

    // Load hot context (INDEX.md first 200 lines)
    const hot = loadHotContext(projectDir);

    // Search relevant memories (text search fallback)
    const dirs = getDirs("project");
    const matches = searchMemories(dirs, prompt).slice(0, 5);

    // Build context blocks
    const blocks: string[] = [TOOL_GUIDANCE];

    if (hot) blocks.push("## Memory Index\n\n" + hot);

    if (matches.length > 0) {
      const recallLines = ["## Relevant memories"];
      for (const m of matches) {
        const warn = freshnessWarning(m);
        recallLines.push(
          `### ${m.frontmatter.category}: ${m.path}`,
          `*${m.frontmatter.created.slice(0, 10)}*${warn ? " " + warn : ""}`,
          "",
          m.body.slice(0, 500),
          "",
        );
      }
      blocks.push(recallLines.join("\n"));
    }

    // Staleness report: broken (source deleted) vs aging (>90d)
    const allMemories = listMemories(projectDir);
    const stale = formatStalenessReport(allMemories, currentProject);
    if (stale) blocks.push(stale);

    return {
      systemPrompt: [event.systemPrompt, ...blocks].filter(Boolean).join("\n\n"),
    };
  });

  pi.on("agent_end", async (event) => {
    // Parse <remember> blocks from assistant response
    const text = getLastAssistantText(event.messages as unknown[]);
    if (!text) return;
    for (const b of parseRememberBlocks(text)) {
      saveMemory(
        projectDir,
        (b.category as MemoryFrontmatter["category"]) || "fact",
        b.headline,
        b.detail,
        { labels: b.labels, scope: "project" },
      );
    }

    // Regenerate INDEX after session
    const allMemories = listMemories(projectDir);
    const projectName = currentProject.split("/").pop() || "";
    writeIndex(projectDir, generateIndex(allMemories, projectName));
  });

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  pi.registerTool({
    name: "lntrx_memory_search",
    label: "Memory Search",
    description:
      "Search local cross-session memory for prior decisions, conventions, bugs, and preferences.",
    promptSnippet: "Check memory before implementing",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text query" },
        limit: { type: "number", description: "Maximum results (default: 5, max: 20)" },
        scope: {
          type: "string",
          enum: ["project", "global", "all"],
          description: "project = current project + global, global = only global, all = everything",
        },
      },
      required: ["query"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const query = String(params.query || "");
      const limit = Math.min(Number(params.limit) || 5, 20);
      const scope = (params.scope as "project" | "global" | "all") || "project";

      const dirs = getDirs(scope);
      const results = searchMemories(dirs, query).slice(0, limit);

      const lines = results.map((m) => {
        const warn = freshnessWarning(m);
        return [
          `### ${m.frontmatter.category}: ${m.path}`,
          `*${m.frontmatter.created.slice(0, 10)}*${warn ? " " + warn : ""}`,
          "",
          m.body.slice(0, 800),
          "",
        ].join("\n");
      });

      return {
        content: [
          {
            type: "text",
            text: results.length > 0 ? lines.join("\n---\n\n") : "No matching memories found.",
          },
        ],
        details: { query, scope, count: results.length },
      };
    },
  });

  pi.registerTool({
    name: "lntrx_memory_learn",
    label: "Memory Learn",
    description:
      "Save a durable note to memory. Agent prefers writing directly to .pi/memory/ via Write tool.",
    promptSnippet: "Record or update what you just learned",
    parameters: {
      type: "object",
      properties: {
        headline: { type: "string", description: "Short title / headline" },
        detail: { type: "string", description: "Longer explanation" },
        category: {
          type: "string",
          enum: ["decision", "fact", "convention", "bug", "correction", "preference"],
          description: "Memory category",
        },
        labels: { type: "string", description: "Comma-separated tags" },
        scope: { type: "string", enum: ["project", "global"], description: "Scope" },
      },
      required: ["headline"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const headline = String(params.headline || "");
      const detail = String(params.detail || "");
      const category = (params.category as MemoryFrontmatter["category"]) || "fact";
      const scope = (params.scope as "project" | "global") || "project";

      const dir = scope === "global" ? globalDir : projectDir;
      const relPath = saveMemory(dir, category, headline, detail, {
        labels: params.labels ? String(params.labels) : undefined,
        scope,
      });

      if (!relPath) {
        return { content: [{ type: "text", text: "Failed to save." }], details: { ok: false } };
      }

      // Regenerate index
      const allMemories = listMemories(dir);
      const projectName = currentProject.split("/").pop() || "";
      writeIndex(dir, generateIndex(allMemories, projectName));

      return {
        content: [{ type: "text", text: `Saved: ${relPath}` }],
        details: { ok: true, path: relPath },
      };
    },
  });

  pi.registerTool({
    name: "lntrx_memory_forget",
    label: "Memory Forget",
    description: "Delete a memory file by path.",
    promptSnippet: "Delete a memory entry",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the memory file" },
        scope: { type: "string", enum: ["project", "global"], description: "Scope" },
      },
      required: ["path"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const relPath = String(params.path || "");
      const scope = (params.scope as "project" | "global") || "project";
      const dir = scope === "global" ? globalDir : projectDir;

      const ok = deleteMemory(dir, relPath);

      // Regenerate index
      const allMemories = listMemories(dir);
      const projectName = currentProject.split("/").pop() || "";
      writeIndex(dir, generateIndex(allMemories, projectName));

      return {
        content: [{ type: "text", text: ok ? `Deleted: ${relPath}` : `Not found: ${relPath}` }],
        details: { ok },
      };
    },
  });

  pi.registerTool({
    name: "lntrx_memory_scan",
    label: "Memory Scan",
    description: "Scan the current project and store an anatomy map in memory.",
    promptSnippet: "Scan project anatomy",
    parameters: { type: "object", properties: {} },
    async execute() {
      currentProject = detectProject(process.cwd());
      projectDir = projectMemoryDir(currentProject);

      const result = scanAnatomy(currentProject);
      const md = anatomyToMarkdown(currentProject, result);
      writeAnatomy(projectDir, md);

      return {
        content: [
          {
            type: "text",
            text: `Scanned: ${result.files} files, ${result.tokens.toLocaleString()} tokens → anatomy.md`,
          },
        ],
        details: { ok: true, files: result.files, tokens: result.tokens },
      };
    },
  });

  pi.registerTool({
    name: "lntrx_memory_bug",
    label: "Memory Bug",
    description: "Track a bug. Writes to bugs/ directory.",
    promptSnippet: "Track or update a bug",
    parameters: {
      type: "object",
      properties: {
        symptom: { type: "string", description: "What went wrong" },
        solution: { type: "string", description: "How it was fixed" },
        state: {
          type: "string",
          enum: ["open", "fixed", "wontfix", "duplicate"],
          description: "Bug state",
        },
      },
      required: ["symptom"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const symptom = String(params.symptom || "");
      const solution = String(params.solution || "");
      const state = String(params.state || "open");

      const body = `**State:** ${state}\n\n**Symptom:** ${symptom}\n\n**Solution:** ${solution || "(none yet)"}\n`;

      const relPath = saveMemory(projectDir, "bug", symptom, body, {
        labels: `state:${state}`,
        scope: "project",
      });

      return {
        content: [
          { type: "text", text: relPath ? `Bug saved: ${relPath}` : "Failed to save bug." },
        ],
        details: { ok: !!relPath, path: relPath },
      };
    },
  });

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  pi.registerCommand("memory", {
    description: "Memory: search|learn|forget|scan|index|cleanup|list [<args>]",
    handler: async (args, c) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0];
      const rest = parts.slice(1).join(" ");

      if (!sub || sub === "list") {
        const all = listMemories(projectDir);
        const global = listMemories(globalDir);
        const total = all.length + global.length;
        c.ui.notify(
          `${total} memories (${all.length} project, ${global.length} global) in .pi/memory/`,
          "info",
        );
        return;
      }

      if (sub === "search") {
        if (!rest) { c.ui.notify("/memory search <query>", "warning"); return; }
        const dirs = getDirs("project");
        const results = searchMemories(dirs, rest).slice(0, 10);
        if (results.length === 0) {
          c.ui.notify("No matches.", "info");
        } else {
          c.ui.notify(
            results.map((m) => `[${m.frontmatter.category}] ${m.path}`).join("\n"),
            "info",
          );
        }
        return;
      }

      if (sub === "learn") {
        if (!rest) { c.ui.notify("/memory learn <headline>", "warning"); return; }
        const relPath = saveMemory(projectDir, "fact", rest, "");
        c.ui.notify(relPath ? `Saved: ${relPath}` : "Failed.", relPath ? "success" : "error");
        return;
      }

      if (sub === "forget") {
        if (!rest) { c.ui.notify("/memory forget <path>", "warning"); return; }
        const ok = deleteMemory(projectDir, rest);
        c.ui.notify(ok ? `Deleted: ${rest}` : `Not found: ${rest}`, ok ? "success" : "error");
        return;
      }

      if (sub === "scan") {
        c.ui.notify("Scanning...", "info");
        const result = scanAnatomy(currentProject);
        const md = anatomyToMarkdown(currentProject, result);
        writeAnatomy(projectDir, md);
        c.ui.notify(
          `Scanned: ${result.files} files, ${result.tokens.toLocaleString()} tokens → anatomy.md`,
          "success",
        );
        return;
      }

      if (sub === "index") {
        const all = listMemories(projectDir);
        const projectName = currentProject.split("/").pop() || "";
        const index = generateIndex(all, projectName);
        writeIndex(projectDir, index);
        c.ui.notify(`INDEX.md regenerated (${all.length} entries).`, "success");
        return;
      }

      if (sub === "cleanup") {
        const all = listMemories(projectDir);
        const report = formatStalenessReport(all, currentProject);
        c.ui.notify(report || "No stale or broken memories found.", "info");
        return;
      }

      c.ui.notify("/memory list|search|learn|forget|scan|index|cleanup", "info");
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers (from old text.ts - kept for <remember> block parsing)
// ---------------------------------------------------------------------------

interface RememberBlock {
  headline: string;
  detail: string;
  category?: string;
  labels?: string;
  scope?: string;
}

function getLastAssistantText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role === "assistant") {
      const content = msg.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((p: Record<string, unknown>) => p.type === "text")
          .map((p: Record<string, unknown>) => String(p.text || ""))
          .join("\n");
      }
    }
  }
  return "";
}

function parseRememberBlocks(text: string): RememberBlock[] {
  const blocks: RememberBlock[] = [];
  const regex = /<remember>([\s\S]*?)<\/remember>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const inner = match[1].trim();
    const parts: RememberBlock = { headline: "", detail: inner };
    const lines = inner.split("\n");
    if (lines.length > 0) {
      parts.headline = lines[0].replace(/^#+\s*/, "").trim();
      parts.detail = lines.slice(1).join("\n").trim() || inner;
    }
    blocks.push(parts);
  }
  return blocks;
}
