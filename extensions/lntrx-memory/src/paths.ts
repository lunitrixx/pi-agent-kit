/**
 * lntrx-memory - path resolution
 *
 * Computes memory storage directories for global and project scope.
 */
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

export const MEMORY_DIRNAME = "memory";
export const INDEX_FILENAME = "INDEX.md";
export const ANATOMY_FILENAME = "anatomy.md";

/**
 * Detect the project root.
 * Uses LNTRX_MEMORY_PROJECT env var, git rev-parse, or falls back to cwd.
 */
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

/**
 * Global memory directory: ~/.pi/memory/
 */
export function globalMemoryDir(): string {
  if (process.env.LNTRX_MEMORY_GLOBAL_DIR) return process.env.LNTRX_MEMORY_GLOBAL_DIR;
  return path.join(os.homedir(), ".pi", MEMORY_DIRNAME);
}

/**
 * Project memory directory: <project>/.pi/memory/
 */
export function projectMemoryDir(projectRoot: string): string {
  if (process.env.LNTRX_MEMORY_PROJECT_DIR) return process.env.LNTRX_MEMORY_PROJECT_DIR;
  return path.join(projectRoot, ".pi", MEMORY_DIRNAME);
}

/**
 * Resolve memory directories for a given scope.
 * scope "all" returns both, "global" returns only global, "project" returns both.
 */
export function resolveDirs(
  projectRoot: string,
  scope: "project" | "global" | "all",
): string[] {
  const dirs: string[] = [];
  if (scope === "global" || scope === "all") dirs.push(globalMemoryDir());
  if (scope === "project" || scope === "all") dirs.push(projectMemoryDir(projectRoot));
  return dirs;
}

/**
 * Ensure all memory directories exist.
 */
export function ensureDirs(dirs: string[]): void {
  const { mkdirSync } = require("node:fs");
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    // Subdirectories for categorized memories
    for (const cat of ["decisions", "facts", "bugs", "conventions", "corrections", "preferences"]) {
      mkdirSync(path.join(dir, cat), { recursive: true });
    }
  }
}
