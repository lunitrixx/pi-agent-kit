/**
 * lntrx-memory - INDEX.md generator
 *
 * Generates a human-readable index of all memories.
 * First 200 lines are auto-loaded at session start as hot context.
 */
import fs from "node:fs";
import path from "node:path";
import type { MemoryFile } from "./frontmatter.js";

const MAX_INDEX_LINES = 200;

/**
 * Generate INDEX.md from a list of memory files.
 */
export function generateIndex(memories: MemoryFile[], projectName?: string): string {
  const lines: string[] = [
    `# Memory Index${projectName ? " – " + projectName : ""}`,
    "",
    `> ${memories.length} memories – generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    "",
  ];

  // Group by category
  const byCategory: Record<string, MemoryFile[]> = {};
  for (const m of memories) {
    const cat = m.frontmatter.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(m);
  }

  const categoryLabels: Record<string, string> = {
    decision: "Decisions",
    bug: "Bugs",
    convention: "Conventions",
    fact: "Facts",
    correction: "Corrections",
    preference: "Preferences",
  };

  const order = ["decision", "bug", "convention", "fact", "correction", "preference"];

  let lineCount = lines.length;

  for (const cat of order) {
    const entries = byCategory[cat];
    if (!entries || entries.length === 0) continue;

    if (lineCount >= MAX_INDEX_LINES) {
      lines.push("", "*(index truncated at 200 lines)*");
      break;
    }

    lines.push(`## ${categoryLabels[cat] || cat}`);
    lineCount++;

    for (const m of entries) {
      if (lineCount >= MAX_INDEX_LINES) {
        lines.push("*(truncated)*");
        break;
      }
      const date = m.frontmatter.created.slice(0, 10);
      const title = path.basename(m.path, ".md").replace(/^\d{4}-\d{2}-\d{2}_/, "");
      lines.push(`- [${date}] ${title}`);
      lineCount++;
    }
    lines.push("");
    lineCount++;
  }

  return lines.join("\n") + "\n";
}

/**
 * Read existing INDEX.md if it exists.
 */
export function readIndex(memoryDir: string): string | null {
  const full = path.join(memoryDir, "INDEX.md");
  try {
    return fs.readFileSync(full, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write INDEX.md to memory directory.
 */
export function writeIndex(memoryDir: string, content: string): void {
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(path.join(memoryDir, "INDEX.md"), content, "utf-8");
}

/**
 * Load hot context: first 200 lines of INDEX.md.
 */
export function loadHotContext(memoryDir: string): string {
  const index = readIndex(memoryDir);
  if (!index) return "";
  const lines = index.split("\n");
  if (lines.length <= MAX_INDEX_LINES) return index;
  return lines.slice(0, MAX_INDEX_LINES).join("\n") + "\n\n*(index truncated)*\n";
}
