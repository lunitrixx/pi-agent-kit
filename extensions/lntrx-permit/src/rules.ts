/**
 * lntrx-permit - rules engine: 4 surfaces, matching, evaluation
 *
 * Surfaces: path, external_directory, tool, bash
 * Default policy: allow, with targeted ask/deny rules.
 * Most-restrictive-wins across surfaces; last-match-wins within each surface.
 */
import { realpathSync } from "node:fs";
import type { NormalizedCommand } from "./shell.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Decision = "allow" | "ask" | "deny";

const DECISION_PRIORITY: Record<Decision, number> = { allow: 0, ask: 1, deny: 2 };

export interface PathRule {
  pattern: string;  // glob-like: *.env, **/id_rsa*, ~/.ssh/*
  decision: Decision;
}

export interface ToolRule {
  pattern: string;  // glob: *, mcp__*, bash
  decision: Decision;
}

export interface BashRule {
  pattern: string;  // glob against normalized canonical form
  decision: Decision;
}

export interface PermitConfig {
  default: Decision;
  path?: Record<string, Decision>;
  external_directory?: Decision;
  tool?: Record<string, Decision>;
  bash?: Record<string, Decision>;
}

export interface CheckContext {
  cwd: string;
  hasUI: boolean;
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/**
 * Convert a user-friendly glob pattern to a regex.
 * Supports: ** (any depth), * (filename wildcard), ~/ (home dir).
 * Patterns without / match against basename; patterns with / match full path.
 */
function globToRegex(pattern: string, cwd: string): RegExp {
  let p = pattern;
  // Expand ~ to cwd's home
  p = p.replace(/^~\//, cwd + "/");

  // If pattern has no path separator, match against basename only
  const basenameOnly = !p.includes("/") && !p.startsWith("**");

  // Use placeholder approach to avoid nested replacements clobbering each other
  // 1. Replace **/ with placeholder
  p = p.replace(/\*\*\//g, "\x00DS\x00");     // **/  → deep star
  p = p.replace(/\*\*/g, "\x00DS\x00");          // **   → deep star
  // 2. Replace * with placeholder
  p = p.replace(/\*/g, "\x00S\x00");              // *    → single star
  // 3. Escape remaining regex special chars
  p = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // 4. Restore placeholders to regex equivalents
  p = p.replace(/\x00DS\x00/g, ".*");             // deep star → .*
  p = p.replace(/\x00S\x00/g, "[^/]*");           // single star → [^/]*

  if (basenameOnly) {
    return new RegExp(`(^|/)${p}$`, "i");
  }

  return new RegExp(`^${p}$`, "i");
}

/**
 * Check a path against the path surface rules.
 * Paths are checked both as-given and symlink-resolved.
 */
export function checkPath(
  filePath: string,
  rules: PathRule[],
  cwd: string,
): Decision {
  if (rules.length === 0) return "allow";

  // Resolve relative paths
  const resolved = filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`;

  const candidates = [resolved];
  try {
    const real = realpathSync(resolved);
    if (real !== resolved) candidates.push(real);
  } catch {
    // File doesn't exist yet (e.g., write target) - use as-given only
  }

  let result: Decision = "allow";
  for (const rule of rules) {
    const re = globToRegex(rule.pattern, cwd);
    for (const cand of candidates) {
      if (re.test(cand)) {
        result = rule.decision;
        break;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// External directory check
// ---------------------------------------------------------------------------

export function checkExternalDirectory(
  filePath: string,
  decision: Decision | undefined,
  cwd: string,
): Decision {
  if (!decision) return "allow";

  const resolved = filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`;
  const normalizedCwd = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;

  // Is it outside cwd?
  if (!resolved.startsWith(normalizedCwd + "/") && resolved !== normalizedCwd) {
    return decision;
  }
  return "allow";
}

// ---------------------------------------------------------------------------
// Tool matching
// ---------------------------------------------------------------------------

export function checkTool(
  toolName: string,
  rules: ToolRule[],
): Decision {
  let result: Decision = "allow";
  for (const rule of rules) {
    if (matchGlob(toolName, rule.pattern)) {
      result = rule.decision;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Bash matching
// ---------------------------------------------------------------------------

export function checkBash(
  cmd: NormalizedCommand,
  rules: BashRule[],
): Decision {
  let result: Decision = "allow";
  for (const rule of rules) {
    if (matchGlob(cmd.canonical, rule.pattern)) {
      result = rule.decision;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Most-restrictive-wins evaluation
// ---------------------------------------------------------------------------

export interface SurfaceResults {
  path: Decision;
  externalDirectory: Decision;
  tool: Decision;
  bash: Decision;
}

export function mostRestrictive(results: SurfaceResults): Decision {
  let worst: Decision = "allow";
  for (const d of Object.values(results)) {
    if (DECISION_PRIORITY[d] > DECISION_PRIORITY[worst]) {
      worst = d;
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Fail-closed escalation
// ---------------------------------------------------------------------------

/**
 * If the command was unparseable, escalate the bash surface decision:
 * - allow → ask
 * - ask → deny (if no UI)
 */
export function applyFailClosed(
  results: SurfaceResults,
  unparseable: boolean,
  hasUI: boolean,
): SurfaceResults {
  if (!unparseable) return results;

  const escalated = { ...results };

  // Unparseable: escalate bash surface
  if (escalated.bash === "allow") {
    escalated.bash = hasUI ? "ask" : "deny";
  } else if (escalated.bash === "ask" && !hasUI) {
    escalated.bash = "deny";
  }

  return escalated;
}

// ---------------------------------------------------------------------------
// Glob matching (simple, no dependency)
// ---------------------------------------------------------------------------

function matchGlob(str: string, pattern: string): boolean {
  // Escape regex special chars except * and ?
  let p = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  p = p.replace(/\*/g, ".*");
  p = p.replace(/\?/g, ".");
  return new RegExp(`^${p}$`, "i").test(str);
}

// ---------------------------------------------------------------------------
// Rule list parsing from config
// ---------------------------------------------------------------------------

export function parsePathRules(pathConfig: Record<string, Decision> | undefined): PathRule[] {
  if (!pathConfig) return [];
  return Object.entries(pathConfig).map(([pattern, decision]) => ({ pattern, decision }));
}

export function parseToolRules(toolConfig: Record<string, Decision> | undefined): ToolRule[] {
  if (!toolConfig) return [];
  return Object.entries(toolConfig).map(([pattern, decision]) => ({ pattern, decision }));
}

export function parseBashRules(bashConfig: Record<string, Decision> | undefined): BashRule[] {
  if (!bashConfig) return [];
  return Object.entries(bashConfig).map(([pattern, decision]) => ({ pattern, decision }));
}