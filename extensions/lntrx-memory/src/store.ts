/**
 * lntrx-memory - file-based memory store
 *
 * CRUD operations on markdown memory files.
 * Replaces the SQLite backend.
 */
import fs from "node:fs";
import path from "node:path";
import {
  type MemoryFrontmatter,
  type MemoryFile,
  parseMemoryFile,
  parseFrontmatter,
  formatFrontmatter,
  generateFilename,
} from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * List all memory files in a directory tree.
 * Returns MemoryFile headers (frontmatter + path + body), sorted by mtime desc.
 */
export function listMemories(dir: string): MemoryFile[] {
  const results: MemoryFile[] = [];
  if (!fs.existsSync(dir)) return results;

  walk(dir, dir, results);
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results;
}

function walk(root: string, dir: string, results: MemoryFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(root, full, results);
    } else if (e.isFile() && e.name.endsWith(".md") && e.name !== "INDEX.md") {
      try {
        const content = fs.readFileSync(full, "utf-8");
        const stat = fs.statSync(full);
        const rel = path.relative(root, full);
        const mem = parseMemoryFile(rel, content, stat.mtimeMs);
        if (mem) results.push(mem);
      } catch {
        /* skip unreadable files */
      }
    }
  }
}

/**
 * Read a single memory file by path (relative to memory dir).
 */
export function readMemory(memoryDir: string, relPath: string): MemoryFile | null {
  const full = path.join(memoryDir, relPath);
  try {
    const content = fs.readFileSync(full, "utf-8");
    const stat = fs.statSync(full);
    return parseMemoryFile(relPath, content, stat.mtimeMs);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Save a new memory file.
 * Returns the relative path of the created file, or null on failure.
 */
export function saveMemory(
  memoryDir: string,
  category: MemoryFrontmatter["category"],
  headline: string,
  body: string,
  opts?: {
    confidence?: MemoryFrontmatter["confidence"];
    sourceRefs?: string[];
    labels?: string;
    scope?: "project" | "global";
  },
): string | null {
  const catDir = categoryToDir(category);
  const dir = path.join(memoryDir, catDir);
  fs.mkdirSync(dir, { recursive: true });

  const filename = generateFilename(category, headline);
  const fullPath = path.join(dir, filename);

  const fm: MemoryFrontmatter = {
    created: new Date().toISOString(),
    category,
  };
  if (opts?.confidence) fm.confidence = opts.confidence;
  if (opts?.sourceRefs?.length) fm.source_refs = opts.sourceRefs;
  if (opts?.labels) fm.labels = opts.labels;

  const fullBody = `# ${headline}\n\n${body}`;
  const content = formatFrontmatter(fm) + "\n\n" + fullBody + "\n";
  try {
    fs.writeFileSync(fullPath, content, "utf-8");
    return path.relative(memoryDir, fullPath);
  } catch {
    return null;
  }
}

/**
 * Update the body of an existing memory file.
 * Preserves frontmatter and adds updated timestamp.
 */
export function updateMemory(memoryDir: string, relPath: string, body: string): boolean {
  const full = path.join(memoryDir, relPath);
  let content: string;
  try {
    content = fs.readFileSync(full, "utf-8");
  } catch {
    return false;
  }

  const { frontmatter: raw } = parseFrontmatter(content);
  const fm: MemoryFrontmatter = {
    category: (raw.category as MemoryFrontmatter["category"]) || "fact",
    created: String(raw.created || new Date().toISOString()),
    updated: new Date().toISOString(),
  };
  if (raw.confidence) fm.confidence = raw.confidence as MemoryFrontmatter["confidence"];
  if (raw.labels) fm.labels = String(raw.labels);
  if (Array.isArray(raw.source_refs)) fm.source_refs = raw.source_refs.map(String);

  const newContent = formatFrontmatter(fm) + "\n\n" + body + "\n";
  try {
    fs.writeFileSync(full, newContent, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a memory file.
 * Returns true if deleted, false if not found or failed.
 */
export function deleteMemory(memoryDir: string, relPath: string): boolean {
  const full = path.join(memoryDir, relPath);
  try {
    fs.unlinkSync(full);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Search (fallback - in-memory text search)
// ---------------------------------------------------------------------------

/**
 * Full-text search across memory directories.
 * Simple term-matching fallback. Primary retrieval is LLM-based.
 */
export function searchMemories(dirs: string[], query: string): MemoryFile[] {
  const results: MemoryFile[] = [];
  const terms = query.toLowerCase().split(/\s+/);

  for (const dir of dirs) {
    const all = listMemories(dir);
    for (const mem of all) {
      const text = (
        mem.frontmatter.created +
        " " +
        mem.frontmatter.category +
        " " +
        (mem.frontmatter.labels || "") +
        " " +
        mem.body
      ).toLowerCase();
      if (terms.every((t) => text.includes(t))) {
        results.push(mem);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Anatomy
// ---------------------------------------------------------------------------

const ANATOMY_FILENAME = "anatomy.md";

/**
 * Read the current anatomy from the project memory dir.
 */
export function readAnatomy(memoryDir: string): string | null {
  const full = path.join(memoryDir, ANATOMY_FILENAME);
  try {
    return fs.readFileSync(full, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write anatomy markdown to the project memory dir.
 */
export function writeAnatomy(memoryDir: string, markdown: string): void {
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(path.join(memoryDir, ANATOMY_FILENAME), markdown, "utf-8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_DIRS: Record<string, string> = {
  decision: "decisions",
  fact: "facts",
  bug: "bugs",
  convention: "conventions",
  correction: "corrections",
  preference: "preferences",
};

function categoryToDir(category: string): string {
  return CATEGORY_DIRS[category] || "facts";
}
