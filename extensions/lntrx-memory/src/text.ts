/**
 * lntrx-memory - text utilities
 *
 * Text extraction, FTS5 query builder, <remember> block parser,
 * and correction detection.
 */
import path from "node:path";
import type { Entry } from "./db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export function formatEntries(entries: Entry[]): string {
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

export type ParsedRemember = {
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

export function getLastAssistantTextBuffer(): string {
  return lastAssistantText;
}

export function setLastAssistantTextBuffer(text: string): void {
  lastAssistantText = text;
}

export function isCorrection(text: string): boolean {
  return /\b(no|nein|falsch|wrong|incorrect|don'?t|nicht|stop)\b.*\b(use|do|nimm|mach|try|versuch|should|solltest)\b/i.test(text)
    || /\b(actually|eigentlich|rather|vielmehr|stattdessen|instead)\b/i.test(text);
}
