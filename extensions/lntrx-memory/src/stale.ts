/**
 * lntrx-memory - staleness detection
 *
 * Checks if memory references are still valid.
 */
import fs from "node:fs";
import path from "node:path";
import type { MemoryFile } from "./frontmatter.js";

/**
 * Check if source references in a memory are still valid.
 * Returns list of references that no longer exist.
 */
export function staleSourceRefs(memory: MemoryFile, projectRoot: string): string[] {
  const refs = memory.frontmatter.source_refs;
  if (!refs || refs.length === 0) return [];

  const stale: string[] = [];
  for (const ref of refs) {
    const full = path.join(projectRoot, ref);
    if (!fs.existsSync(full)) {
      stale.push(ref);
    }
  }
  return stale;
}

/**
 * Calculate memory age in days.
 */
export function memoryAgeDays(mtimeMs: number): number {
  return Math.floor((Date.now() - mtimeMs) / (1000 * 60 * 60 * 24));
}

/**
 * Generate a freshness warning for a memory.
 * Returns empty string if memory is fresh (< 7 days).
 */
export function freshnessWarning(memory: MemoryFile): string {
  const days = memoryAgeDays(memory.mtimeMs);
  if (days <= 7) return "";
  return `⚠️ ${days} days old. Verify against current code before relying on this.`;
}

/**
 * Check if a memory is stale (source refs missing or very old).
 */
export function isStale(memory: MemoryFile, projectRoot: string): boolean {
  const stale = staleSourceRefs(memory, projectRoot);
  if (stale.length > 0) return true;
  return memoryAgeDays(memory.mtimeMs) > 90; // Older than 90 days
}

/**
 * Generate a staleness report for all memories.
 * Returns two lists: broken (should delete) and aging (review, probably keep).
 */
export function stalenessReport(memories: MemoryFile[], projectRoot: string): { broken: MemoryFile[]; aging: MemoryFile[] } {
  const broken: MemoryFile[] = [];
  const aging: MemoryFile[] = [];
  for (const mem of memories) {
    const stale = staleSourceRefs(mem, projectRoot);
    const days = memoryAgeDays(mem.mtimeMs);
    if (stale.length > 0) {
      broken.push(mem);
    } else if (days > 90) {
      aging.push(mem);
    }
  }
  return { broken, aging };
}

/**
 * Format staleness report as markdown for the agent.
 */
export function formatStalenessReport(
  memories: MemoryFile[],
  projectRoot: string,
): string {
  const { broken, aging } = stalenessReport(memories, projectRoot);
  const lines: string[] = [];

  if (broken.length > 0) {
    lines.push("## Broken memories (source files deleted)");
    lines.push("");
    for (const m of broken) {
      const refs = m.frontmatter.source_refs?.join(", ") || "(none)";
      lines.push(`- \`${m.path}\` – ${m.frontmatter.category} – missing: ${refs}`);
    }
    lines.push("");
  }

  if (aging.length > 0) {
    lines.push("## Aging memories (>90 days, review)");
    lines.push("");
    for (const m of aging) {
      const days = memoryAgeDays(m.mtimeMs);
      lines.push(`- \`${m.path}\` – ${m.frontmatter.category} – ${days} days old`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
