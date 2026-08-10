/**
 * lntrx-githooks — git hook management
 *
 * Split from lntrx-guard. Manages git hooks at the filesystem level (works
 * for manual commits too, not just agent-run ones). No permission logic here.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { get, set, getProject, setProject } from "../../../lib/config";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const PRE_COMMIT_HOOK = `#!/bin/sh
# Installed by lntrx-githooks — do not edit manually
BRANCH=$(git branch --show-current 2>/dev/null)
if [ "$BRANCH" = "main" ]; then
  echo ""
  echo "  lntrx-githooks: Direct commits to main are blocked."
  echo "  Use a feature branch (feat/..., fix/...) and open a PR."
  echo "  Bypass with: git commit --no-verify"
  echo ""
  exit 1
fi
`;

interface HookDef {
  name: string;
  configKey: string;
  script: string;
}

const HOOKS: HookDef[] = [
  { name: "pre-commit", configKey: "lntrx-githooks.block-main-commit", script: PRE_COMMIT_HOOK },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Absolute path of a hook, asked of git rather than assembled by hand.
 *
 * In a worktree `.git` is a *file* pointing at the real directory, so
 * `<repo>/.git/hooks/pre-commit` is not a path at all: writing it threw
 * `ENOTDIR` and took the whole session_start handler with it. That error was
 * printed by every agent running in a worktree, including inside the failing
 * reviewer subagents of 2026-08-10.
 *
 * `git rev-parse --git-path` resolves the same name in a plain checkout, a
 * worktree, and a repository with `core.hooksPath` set - all three cases this
 * used to get wrong. Returns undefined outside a repository.
 */
export function resolveHookPath(repoPath: string, hookName: string): string | undefined {
  try {
    const resolved = execSync(`git rev-parse --path-format=absolute --git-path hooks/${hookName}`, {
      encoding: "utf-8",
      cwd: repoPath,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return resolved.length > 0 ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function hookEnabled(repoPath: string, hook: HookDef): boolean {
  const p = getProject(repoPath, hook.configKey);
  if (p !== undefined) return !!p;
  const g = get(hook.configKey);
  return g === undefined ? true : !!g;
}

function hookInstalled(repoPath: string, hook: HookDef): boolean {
  const hookPath = resolveHookPath(repoPath, hook.name);
  if (!hookPath) return true; // not a repository - nothing to install, nothing to report
  if (!existsSync(hookPath)) return false;
  try {
    const content = readFileSync(hookPath, "utf-8");
    return content.includes("lntrx-githooks") || content.includes("lntrx-guard");
  } catch {
    return false;
  }
}

function installHook(repoPath: string, hook: HookDef): boolean {
  const hookPath = resolveHookPath(repoPath, hook.name);
  if (!hookPath) return false;
  try {
    mkdirSync(dirname(hookPath), { recursive: true });
    writeFileSync(hookPath, hook.script);
    chmodSync(hookPath, 0o755);
    return true;
  } catch {
    // A read-only or otherwise unwritable hooks directory is not worth taking
    // the session down for; the tool-call guard below still blocks main.
    return false;
  }
}

function removeHook(repoPath: string, hook: HookDef): boolean {
  const hookPath = resolveHookPath(repoPath, hook.name);
  if (!hookPath || !existsSync(hookPath)) return false;
  try {
    rmSync(hookPath, { force: true });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // ---- Block git commit on main at the tool-call level (saves agent time) ----
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd: string | undefined = (event.input as any)?.command;
    if (!cmd) return;
    // Match git commit (but not --allow-empty alone, not commit --amend, not commit -m "merge")
    if (!/\bgit\s+commit\b/.test(cmd) || /--allow-empty/.test(cmd)) return;
    try {
      const branch = execSync("git branch --show-current", {
        encoding: "utf-8",
        cwd: ctx.cwd,
      }).trim();
      if (branch === "main") {
        return {
          block: true,
          reason:
            "Direct commits to main are blocked. Create a branch (feat/..., fix/...) and submit a PR. Bypass with git commit --no-verify.",
        };
      }
    } catch {
      // not a git repo — skip
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    for (const hook of HOOKS) {
      if (!hookEnabled(ctx.cwd, hook)) {
        if (hookInstalled(ctx.cwd, hook)) {
          removeHook(ctx.cwd, hook);
        }
        continue;
      }
      if (!hookInstalled(ctx.cwd, hook)) {
        installHook(ctx.cwd, hook);
      }
    }
  });

  pi.registerCommand("githooks", {
    description: "Manage git hooks: status, install, uninstall, disable, enable [--global] [hook-name]",
    getArgumentCompletions: (prefix) => {
      const verbs = ["status", "install", "uninstall", "disable", "enable"];
      const hooks = HOOKS.map((h) => h.name);
      const all = [...verbs, ...hooks];
      const match = all.filter((s) => s.startsWith(prefix));
      return match.length > 0 ? match.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0];
      const global = parts.includes("--global") || parts.includes("-g");
      const hookName = parts.filter((p) => !["disable","enable","install","uninstall","status","--global","-g"].includes(p))[0];
      const targets = hookName ? HOOKS.filter((h) => h.name === hookName) : HOOKS;

      if (sub === "disable") {
        for (const hook of targets) {
          global ? set(hook.configKey, false) : setProject(ctx.cwd, hook.configKey, false);
          if (hookInstalled(ctx.cwd, hook)) removeHook(ctx.cwd, hook);
        }
        ctx.ui.notify(`Hooks disabled ${global ? "globally" : "for this project"}: ${targets.map(h => h.name).join(", ")}.`, "warning");
        return;
      }
      if (sub === "enable") {
        for (const hook of targets) {
          global ? set(hook.configKey, undefined) : setProject(ctx.cwd, hook.configKey, undefined);
          if (hookEnabled(ctx.cwd, hook) && !hookInstalled(ctx.cwd, hook)) installHook(ctx.cwd, hook);
        }
        ctx.ui.notify(`Hooks enabled ${global ? "globally" : "for this project"}: ${targets.map(h => h.name).join(", ")}.`, "success");
        return;
      }
      if (sub === "uninstall") {
        let removed = 0;
        for (const hook of targets) { if (removeHook(ctx.cwd, hook)) removed++; }
        ctx.ui.notify(removed > 0 ? `${removed} hook(s) removed.` : "No hooks to remove.", removed > 0 ? "warning" : "info");
        return;
      }
      if (sub === "install") {
        let installed = 0;
        for (const hook of targets) { if (installHook(ctx.cwd, hook)) installed++; }
        ctx.ui.notify(installed > 0 ? `${installed} hook(s) installed.` : "Not a git repo.", installed > 0 ? "success" : "error");
        return;
      }
      // status
      const lines: string[] = [];
      for (const hook of HOOKS) {
        const pv = getProject(ctx.cwd, hook.configKey);
        const gv = get(hook.configKey);
        const fileOk = hookInstalled(ctx.cwd, hook);
        let state: string;
        if (pv !== undefined) state = pv ? "ON (project)" : "OFF (project)";
        else if (gv !== undefined) state = gv ? "ON (global)" : "OFF (global)";
        else if (fileOk) state = "ON";
        else state = "MISSING";
        lines.push(`  ${hook.name}: ${state}  [${hook.configKey}]`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}