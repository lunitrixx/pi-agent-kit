/**
 * lntrx-memory - frontmatter parser
 *
 * Lightweight YAML frontmatter parser - no dependencies.
 * Parses the --- delimited block at the start of markdown files.
 */

export interface MemoryFrontmatter {
  created: string;       // ISO 8601 date
  updated?: string;
  category: "decision" | "fact" | "convention" | "bug" | "correction" | "preference";
  confidence?: "high" | "medium" | "low";
  source_refs?: string[];
  labels?: string;
}

export interface MemoryFile {
  path: string;          // relative to memory root
  frontmatter: MemoryFrontmatter;
  body: string;          // content after frontmatter
  mtimeMs: number;
}

const VALID_CATEGORIES = new Set(["decision", "fact", "convention", "bug", "correction", "preference"]);
const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

/**
 * Parse a single YAML line into key: value.
 * Handles string values, arrays (with - prefix on next lines), and quoted strings.
 */
function parseLine(line: string): { key: string; value: unknown } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const key = line.slice(0, colon).trim();
  let raw = line.slice(colon + 1).trim();

  // Remove surrounding quotes
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }

  return { key, value: raw };
}

/**
 * Parse YAML frontmatter from markdown content.
 * Expects --- on first line, then key: value pairs, then closing ---.
 */
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, body: content };

  const fm: Record<string, unknown> = {};
  let i = 1;
  let inArray: { key: string; values: string[] } | null = null;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      // Flush pending array
      if (inArray) {
        fm[inArray.key] = inArray.values;
        inArray = null;
      }
      i++; // skip past ---
      break;
    }

    // Array continuation: "  - value"
    if (inArray && /^\s+-\s+/.test(line)) {
      const v = line.replace(/^\s+-\s+/, "").trim();
      inArray.values.push(v);
      continue;
    }
    // Flush previous array if this isn't a continuation
    if (inArray) {
      fm[inArray.key] = inArray.values;
      inArray = null;
    }

    // Empty line in frontmatter - skip
    if (line.trim() === "") continue;

    const parsed = parseLine(line);
    if (!parsed) continue;

    // Check if value is array start indicator
    if (parsed.value === "" || parsed.value === "[]") {
      inArray = { key: parsed.key, values: [] };
    } else {
      fm[parsed.key] = parsed.value;
    }
  }

  // Flush any remaining array
  if (inArray) {
    fm[inArray.key] = inArray.values;
  }

  const body = lines.slice(i).join("\n").trimStart();
  return { frontmatter: fm, body };
}

/**
 * Serialize frontmatter to YAML string.
 */
export function formatFrontmatter(fm: MemoryFrontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`created: ${fm.created}`);
  if (fm.updated) lines.push(`updated: ${fm.updated}`);
  lines.push(`category: ${fm.category}`);
  if (fm.confidence) lines.push(`confidence: ${fm.confidence}`);
  if (fm.labels) lines.push(`labels: ${fm.labels}`);
  if (fm.source_refs && fm.source_refs.length > 0) {
    lines.push("source_refs:");
    for (const ref of fm.source_refs) lines.push(`  - ${ref}`);
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Validate and normalize raw frontmatter into MemoryFrontmatter.
 */
export function normalizeFrontmatter(raw: Record<string, unknown>): MemoryFrontmatter | null {
  const created = String(raw.created || "");
  if (!created) return null;

  const category = String(raw.category || "fact");
  if (!VALID_CATEGORIES.has(category)) return null;

  const fm: MemoryFrontmatter = { created, category: category as MemoryFrontmatter["category"] };

  if (raw.updated) fm.updated = String(raw.updated);
  if (raw.confidence && VALID_CONFIDENCE.has(String(raw.confidence))) {
    fm.confidence = String(raw.confidence) as MemoryFrontmatter["confidence"];
  }
  if (raw.labels) fm.labels = String(raw.labels);
  if (Array.isArray(raw.source_refs)) {
    fm.source_refs = raw.source_refs.map(String);
  }

  return fm;
}

/**
 * Parse a memory file into MemoryFile.
 * Returns null if frontmatter is invalid or missing.
 */
export function parseMemoryFile(fullPath: string, content: string, mtimeMs: number): MemoryFile | null {
  const { frontmatter: raw, body } = parseFrontmatter(content);
  const fm = normalizeFrontmatter(raw);
  if (!fm) return null;
  return { path: fullPath, frontmatter: fm, body, mtimeMs };
}

/**
 * Generate a filename for a new memory.
 * Format: {date}_{slug}.md
 */
export function generateFilename(category: string, headline: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = headline
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${date}_${slug || category}.md`;
}
