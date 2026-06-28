/**
 * lntrx-memory - project anatomy scanner
 *
 * Scans project directories for code files with token estimates.
 * Respects .scanignore (priority) or .gitignore (fallback) patterns.
 */
import path from "node:path";
import fs from "node:fs";

const CODE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".c", ".h", ".cpp",
  ".lua", ".md", ".json", ".yaml", ".toml",
]);
// Hardcoded baseline - always skipped regardless of ignore file
const SCAN_IGNORE = new Set([
  ".git", "node_modules", ".pi", "dist", "build", "__pycache__", ".next", "target",
]);

// SQLite WAL/SHM files that sit next to any .db file
const DB_ARTIFACT_EXTS = new Set([".db-shm", ".db-wal", ".db-wal2"]);

// ---------------------------------------------------------------------------
// Gitignore-style pattern matching for scan
// ---------------------------------------------------------------------------

interface IgnoreRule {
  pattern: string;
  regex: RegExp;
  dirOnly: boolean;
}

/**
 * Convert a gitignore glob pattern to a regex string.
 * Handles *, **, ?, and character classes.
 */
function globToRegex(pattern: string): string {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") {
        // **/ matches zero or more directories
        re += "(?:.+/)?";
        i += 3;
      } else if (i + 2 >= pattern.length) {
        // Trailing ** matches everything
        re += ".*";
        i += 2;
      } else {
        // /**/ in the middle matches at least one segment
        re += ".+";
        i += 2;
      }
      continue;
    }
    if (c === "*") { re += "[^/]*"; i++; continue; }
    if (c === "?") { re += "[^/]"; i++; continue; }
    if (c === "[") {
      const end = pattern.indexOf("]", i);
      if (end === -1) { re += "\\["; i++; continue; }
      re += pattern.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    // Escape regex specials
    if (".+^${}()|\\".includes(c)) re += "\\" + c;
    else re += c;
    i++;
  }
  return re;
}

function parseIgnorePattern(line: string): IgnoreRule {
  let p = line.trim();
  let dirOnly = false;
  let anchored = false;

  // Trailing / means directory only
  if (p.endsWith("/")) { dirOnly = true; p = p.slice(0, -1); }

  // Leading / means anchored to project root
  if (p.startsWith("/")) { anchored = true; p = p.slice(1); }

  // Pattern without / is unanchored and matches at any level
  if (!anchored && !p.includes("/")) p = "**/" + p;

  return {
    pattern: line.trim(),
    regex: new RegExp(`^${globToRegex(p)}${dirOnly ? "(?:/.*)?$" : "$"}`),
    dirOnly,
  };
}

/**
 * Load ignore patterns from .scanignore (preferred) or .gitignore (fallback).
 * Returns empty array if neither file exists or can't be read.
 */
export function loadIgnorePatterns(root: string): IgnoreRule[] {
  let ignorePath = path.join(root, ".scanignore");
  if (!fs.existsSync(ignorePath)) ignorePath = path.join(root, ".gitignore");

  const patterns: IgnoreRule[] = [];
  try {
    const content = fs.readFileSync(ignorePath, "utf-8");
    for (let l of content.split("\n")) {
      l = l.trim();
      if (!l || l.startsWith("#")) continue;
      if (l.startsWith("!")) continue; // negations not supported
      patterns.push(parseIgnorePattern(l));
    }
  } catch { /* no ignore file */ }
  return patterns;
}

function isIgnored(relPath: string, isDir: boolean, patterns: IgnoreRule[]): boolean {
  const bare = isDir ? relPath.replace(/\/$/, "") : relPath;
  for (const rule of patterns) {
    if (!isDir && rule.dirOnly) continue;
    if (rule.regex.test(relPath)) return true;
    // Non-dir-only patterns also match directory basenames without trailing /
    if (isDir && !rule.dirOnly && rule.regex.test(bare)) return true;
  }
  return false;
}

export function scanAnatomy(root: string): { files: number; tokens: number; byExt: Record<string, string[]> } {
  const ignorePatterns = loadIgnorePatterns(root);
  const entries: { path: string; ext: string; tokens: number }[] = [];

  function walk(dir: string) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (SCAN_IGNORE.has(f)) continue;
        // Skip SQLite WAL/SHM artifacts next to .db files
        if (DB_ARTIFACT_EXTS.has(path.extname(f).toLowerCase())) continue;
        const full = path.join(dir, f);
        const rel = path.relative(root, full);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          if (isIgnored(rel + "/", true, ignorePatterns)) continue;
          walk(full);
          continue;
        }
        if (isIgnored(rel, false, ignorePatterns)) continue;
        const ext = path.extname(f).toLowerCase();
        if (!CODE_EXTS.has(ext)) continue;
        entries.push({
          path: rel,
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

export function anatomyToMarkdown(root: string, result: ReturnType<typeof scanAnatomy>): string {
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
