/**
 * lntrx-githooks — git hook management
 *
 * Split from lntrx-guard. Manages git hooks at the filesystem level (works
 * for manual commits too, not just agent-run ones). No permission logic here.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "child_process";
import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { get, set, getProject, setProject } from "../../lntrx-config/src/config";

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

function hookEnabled(repoPath: string, hook: HookDef): boolean {
  const p = getProject(repoPath, hook.configKey);
  if (p !== undefined) return !!p;
  const g = get(hook.configKey);
  return g === undefined ? true : !!g;
}

function hookInstalled(repoPath: string, hook: HookDef): boolean {
  if (!existsSync(join(repoPath, ".git"))) return true;
  try {
    const content = execSync(`cat .git/hooks/${hook.name}`, { encoding: "utf-8", cwd: repoPath });
    return content.includes("lntrx-githooks") || content.includes("lntrx-guard");
  } catch {
    return false;
  }
}

function installHook(repoPath: string, hook: HookDef): boolean {
  if (!existsSync(join(repoPath, ".git"))) return false;
  const hookPath = join(repoPath, ".git", "hooks", hook.name);
  writeFileSync(hookPath, hook.script);
  chmodSync(hookPath, 0o755);
  return true;
}

function removeHook(repoPath: string, hook: HookDef): boolean {
  const hookPath = join(repoPath, ".git", "hooks", hook.name);
  if (!existsSync(hookPath)) return false;
  execSync(`rm -f "${hookPath}"`);
  return true;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
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