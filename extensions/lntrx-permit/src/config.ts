/**
 * lntrx-permit - configuration loading, defaults, migration
 *
 * Config files: ~/.pi/agent/pi-agent-kit.json (global) and <repo>/.pi/pi-agent-kit.json (project)
 * Project overrides global (per the existing convention).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PermitConfig, BashRule, ToolRule, PathRule } from "./rules.js";

// ---------------------------------------------------------------------------
// Default configuration (container-friendly)
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: PermitConfig = {
  default: "allow",
  path: {
    "*.env": "deny",
    "*.env.example": "allow",
    "~/.ssh/*": "deny",
    "**/id_rsa*": "deny",
    "**/*.pem": "deny",
  },
  external_directory: "ask",
  tool: { "*": "allow" },
  bash: {
    "*": "allow",

    // Can destroy mounted code — container does NOT protect here
    "rm *--recursive*": "ask",
    "rm *--force*": "ask",
    "git clean *": "ask",
    "git reset *--hard*": "ask",

    // Reaches beyond the container
    "git push *--force*": "ask",
    "git push *--delete*": "ask",
    "npm publish*": "ask",
    "yarn publish*": "ask",
    "*drop database*": "deny",
    "*drop table*": "ask",
    "curl *|*sh*": "ask",
    "wget *|*sh*": "ask",
    "sops *": "ask",
  },
};

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

function globalConfigPath(): string {
  return join(homedir(), ".pi", "agent", "pi-agent-kit.json");
}

function projectConfigPath(repoPath: string): string {
  return join(repoPath, ".pi", "pi-agent-kit.json");
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function readJSON(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Load the merged permit config: project overrides global, both overridden by defaults.
 */
export function loadConfig(cwd: string): PermitConfig {
  const global = readJSON(globalConfigPath());
  const project = readJSON(projectConfigPath(cwd));

  const globalPermit = (global["lntrx-permit"] || {}) as Partial<PermitConfig>;
  const projectPermit = (project["lntrx-permit"] || {}) as Partial<PermitConfig>;

  const merged: PermitConfig = {
    default: projectPermit.default || globalPermit.default || DEFAULT_CONFIG.default,
  };

  // Deep-merge each surface
  const mergeRecords = <T extends Record<string, any>>(a: T | undefined, b: T | undefined, c: T): T => {
    return { ...c, ...(a || {}), ...(b || {}) };
  };

  if (globalPermit.path || projectPermit.path || DEFAULT_CONFIG.path) {
    merged.path = mergeRecords(
      globalPermit.path as Record<string, string>,
      projectPermit.path as Record<string, string>,
      DEFAULT_CONFIG.path || {},
    );
  }

  if (globalPermit.tool || projectPermit.tool || DEFAULT_CONFIG.tool) {
    merged.tool = mergeRecords(
      globalPermit.tool as Record<string, string>,
      projectPermit.tool as Record<string, string>,
      DEFAULT_CONFIG.tool || {},
    );
  }

  if (globalPermit.bash || projectPermit.bash || DEFAULT_CONFIG.bash) {
    merged.bash = mergeRecords(
      globalPermit.bash as Record<string, string>,
      projectPermit.bash as Record<string, string>,
      DEFAULT_CONFIG.bash || {},
    );
  }

  merged.external_directory = projectPermit.external_directory
    || globalPermit.external_directory
    || DEFAULT_CONFIG.external_directory;

  return merged;
}

// ---------------------------------------------------------------------------
// Migration: old lntrx-guard.risks.* → lntrx-permit bash rules
// ---------------------------------------------------------------------------

const OLD_RISK_TO_PATTERN: Record<string, string> = {
  "rm-rf": "rm *--recursive*",
  "rm-wildcard": "rm *",
  "sudo": "sudo *",
  "chmod-777": "chmod *777*",
  "chown": "chown *",
  "force-push": "git push *--force*",
  "hard-reset": "git reset *--hard*",
  "git-clean": "git clean *",
  "dd": "dd *",
  "docker-prune": "docker system prune *",
  "docker-rm": "docker rm *",
  "drop-database": "*drop database*",
  "drop-table": "*drop table*",
  "pip-uninstall": "pip uninstall *",
  "npm-uninstall": "npm uninstall *",
  "sops-wildcard": "sops *",
  "pipe-shell": "curl *|*sh*",
  "push-delete": "git push *--delete*",
  "package-publish": "npm publish*",
};

export interface MigrationResult {
  rules: Record<string, "allow" | "ask" | "deny">;
  unmapped: string[];
}

/**
 * Read old lntrx-guard.risks.* keys and produce bash rules for the permit config.
 */
export function migrateOldRisks(cwd: string): MigrationResult {
  const result: MigrationResult = { rules: {}, unmapped: [] };
  const global = readJSON(globalConfigPath());
  const project = readJSON(projectConfigPath(cwd));

  // Scan both global and project configs for lntrx-guard.risks.* keys
  const allConfigs: Record<string, unknown>[] = [global, project];
  const seen = new Set<string>();

  for (const config of allConfigs) {
    for (const key of Object.keys(config)) {
      if (!key.startsWith("lntrx-guard.risks.")) continue;
      const riskId = key.replace("lntrx-guard.risks.", "");
      if (seen.has(riskId)) continue;
      seen.add(riskId);

      const pattern = OLD_RISK_TO_PATTERN[riskId];
      if (!pattern) {
        result.unmapped.push(riskId);
        continue;
      }

      const enabled = config[key];
      // If it was explicitly disabled, map to "allow" (not asked).
      // If enabled/undefined (default on), map to "ask".
      result.rules[pattern] = enabled === false ? "allow" : "ask";
    }
  }

  return result;
}