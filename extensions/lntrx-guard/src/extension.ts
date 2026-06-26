import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { get, set } from "../../lntrx-config/src/config";

const NS = "lntrx-guard";

function on(): boolean {
  const v = get(NS);
  return v === undefined ? true : !!v; // on by default
}

interface Risk {
  pattern: RegExp;
  label: string;
  severity: "destructive" | "risky";
  detail?: string;
}

const RISKS: Risk[] = [
  { pattern: /\brm\s+-rf?\b/,                          label: "Recursive delete",     severity: "destructive", detail: "Irreversible file deletion" },
  { pattern: /\brm\s+.*\*/,                            label: "Wildcard delete",     severity: "destructive", detail: "Deletes everything matching" },
  { pattern: /\bsudo\b/,                               label: "Superuser command",   severity: "risky",       detail: "Runs with root privileges" },
  { pattern: /\bchmod\s+777\b/,                        label: "World-writable chmod",severity: "risky",       detail: "777 opens files to everyone" },
  { pattern: /\bchown\b/,                              label: "Change ownership",    severity: "risky" },
  { pattern: /\bgit\s+push\s+.*--force/,               label: "Force push",          severity: "destructive", detail: "Overwrites remote history" },
  { pattern: /\bgit\s+reset\s+--hard/,                 label: "Hard reset",          severity: "destructive", detail: "Discards all uncommitted changes" },
  { pattern: /\bgit\s+clean\b/,                        label: "Git clean",           severity: "destructive", detail: "Removes untracked files" },
  { pattern: /\bdd\s+if=/,                             label: "Disk copy (dd)",      severity: "destructive", detail: "Can overwrite disks" },
  { pattern: /\bdocker\s+system\s+prune/,              label: "Docker prune",        severity: "risky",       detail: "Removes all unused Docker data" },
  { pattern: /\bdocker\s+rm\b/,                        label: "Docker remove",       severity: "risky" },
  { pattern: /\bdrop\s+database\b/i,                   label: "Drop database",       severity: "destructive", detail: "Destroys database permanently" },
  { pattern: /\bdrop\s+table\b/i,                      label: "Drop table",          severity: "destructive", detail: "Destroys table permanently" },
  { pattern: /\bpip\s+uninstall\b/,                    label: "Pip uninstall",       severity: "risky" },
  { pattern: /\bnpm\s+uninstall\b/,                    label: "npm uninstall",       severity: "risky" },
];

function findRisk(cmd: string): Risk | undefined {
  return RISKS.find((r) => r.pattern.test(cmd));
}

interface SecretPattern { name: string; pattern: RegExp; }

const SECRETS: SecretPattern[] = [
  { name: "OpenAI Key",       pattern: /sk-[A-Za-z0-9]{32,}/ },
  { name: "GitHub Token",     pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "AWS Key",          pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "AWS Secret",       pattern: /[A-Za-z0-9/+=]{40}/ },
  { name: "Google API Key",   pattern: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: "JWT Token",        pattern: /eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+/=]*/ },
  { name: "Private Key",      pattern: /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/ },
  { name: "Slack Token",      pattern: /xox[baprs]-[0-9A-Za-z\-]{10,}/ },
  { name: "Stripe Key",       pattern: /[sr]k_live_[0-9a-zA-Z]{24,}/ },
];

function scanSecrets(text: string): string[] {
  const found: string[] = [];
  for (const s of SECRETS) {
    if (s.pattern.test(text)) found.push(s.name);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Git hook — blocks direct commits to main
// ---------------------------------------------------------------------------

const HOOK_SCRIPT = `#!/bin/sh
# Installed by lntrx-guard — do not edit manually
BRANCH=$(git branch --show-current 2>/dev/null)
if [ "$BRANCH" = "main" ]; then
  echo ""
  echo "  lntrx-guard: Direct commits to main are blocked."
  echo "  Use a feature branch (feat/..., fix/...) and open a PR."
  echo "  Bypass with: git commit --no-verify"
  echo ""
  exit 1
fi
`;

function projectConfigPath(repoPath: string): string {
  return join(repoPath, ".pi", "guard.json");
}

function projectConfig(repoPath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(projectConfigPath(repoPath), "utf-8"));
  } catch {
    return {};
  }
}

function writeProjectConfig(repoPath: string, cfg: Record<string, unknown>): void {
  mkdirSync(join(repoPath, ".pi"), { recursive: true });
  writeFileSync(projectConfigPath(repoPath), JSON.stringify(cfg, null, 2) + "\n");
}

function hookGloballyDisabled(): boolean {
  return get("lntrx-guard.hook") === false;
}

function hookProjectDisabled(repoPath: string): boolean {
  return projectConfig(repoPath).hook === false;
}

function hookEnabled(repoPath: string): boolean {
  if (hookGloballyDisabled()) return false;
  if (hookProjectDisabled(repoPath)) return false;
  return true;
}

function hookInstalled(repoPath: string): boolean {
  if (!existsSync(join(repoPath, ".git"))) return true; // not a repo, skip
  try {
    const hook = execSync("cat .git/hooks/pre-commit", { encoding: "utf-8", cwd: repoPath });
    return hook.includes("lntrx-guard");
  } catch {
    return false;
  }
}

function installHook(repoPath: string): boolean {
  if (!existsSync(join(repoPath, ".git"))) return false;
  const hookPath = join(repoPath, ".git", "hooks", "pre-commit");
  writeFileSync(hookPath, HOOK_SCRIPT);
  chmodSync(hookPath, 0o755);
  return true;
}

function removeHook(repoPath: string): boolean {
  const hookPath = join(repoPath, ".git", "hooks", "pre-commit");
  if (!existsSync(hookPath)) return false;
  execSync(`rm -f "${hookPath}"`);
  return true;
}

export default function (pi: ExtensionAPI) {
  // ---- Session start: auto-install git hook ----
  pi.on("session_start", async (_event, ctx) => {
    if (!on()) return;
    if (!hookEnabled(ctx.cwd)) {
      // Hook is disabled globally or per-project — remove if present
      if (hookInstalled(ctx.cwd)) {
        removeHook(ctx.cwd);
        ctx.ui.notify("lntrx-guard: Pre-commit hook removed (disabled by config).", "warning");
      }
      return;
    }
    if (!hookInstalled(ctx.cwd)) {
      const installed = installHook(ctx.cwd);
      if (installed) {
        ctx.ui.notify(
          "lntrx-guard: Installed pre-commit hook — direct commits to main are now blocked.",
          "success",
        );
      }
    }
  });

  // ---- /guard-hook command ----
  pi.registerCommand("guard-hook", {
    description: "Manage the pre-commit hook: status, install, uninstall, disable, enable [--global]",
    getArgumentCompletions: (prefix) => {
      const subs = ["status", "install", "uninstall", "disable", "enable"];
      const match = subs.filter((s) => s.startsWith(prefix));
      return match.length > 0 ? match.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0];
      const global = parts.includes("--global") || parts.includes("-g");

      if (sub === "disable") {
        if (global) {
          set("lntrx-guard.hook", false);
          ctx.ui.notify("Pre-commit hook disabled globally. /guard-hook enable --global to undo.", "warning");
        } else {
          const cfg = projectConfig(ctx.cwd);
          cfg.hook = false;
          writeProjectConfig(ctx.cwd, cfg);
          ctx.ui.notify("Pre-commit hook disabled for this project. /guard-hook enable to undo.", "warning");
        }
        // Remove hook file immediately
        if (hookInstalled(ctx.cwd)) {
          removeHook(ctx.cwd);
          ctx.ui.notify("Existing hook file removed.", "info");
        }
        return;
      }

      if (sub === "enable") {
        if (global) {
          set("lntrx-guard.hook", undefined);
          ctx.ui.notify("Pre-commit hook enabled globally.", "success");
        } else {
          const cfg = projectConfig(ctx.cwd);
          delete cfg.hook;
          writeProjectConfig(ctx.cwd, cfg);
          ctx.ui.notify("Pre-commit hook enabled for this project.", "success");
        }
        // Re-install hook if in a repo
        if (hookEnabled(ctx.cwd) && !hookInstalled(ctx.cwd)) {
          installHook(ctx.cwd);
          ctx.ui.notify("Pre-commit hook installed.", "success");
        }
        return;
      }

      if (sub === "uninstall" || sub === "remove") {
        const removed = removeHook(ctx.cwd);
        ctx.ui.notify(removed ? "Pre-commit hook removed." : "No hook to remove.", removed ? "warning" : "info");
        return;
      }

      if (sub === "install") {
        const ok = installHook(ctx.cwd);
        ctx.ui.notify(ok ? "Pre-commit hook installed." : "Not a git repo.", ok ? "success" : "error");
        return;
      }

      // Default: status
      const globalOff = hookGloballyDisabled();
      const projectOff = hookProjectDisabled(ctx.cwd);
      const fileOk = hookInstalled(ctx.cwd);

      let msg = "";
      if (globalOff) {
        msg = "Pre-commit hook: DISABLED globally. /guard-hook enable --global";
      } else if (projectOff) {
        msg = "Pre-commit hook: DISABLED for this project. /guard-hook enable";
      } else if (fileOk) {
        msg = "Pre-commit hook: ACTIVE — main branch protected.";
      } else {
        msg = "Pre-commit hook: NOT INSTALLED. /guard-hook install";
      }
      ctx.ui.notify(msg, globalOff || projectOff ? "warning" : "info");
    },
  });

  pi.registerCommand("safety", {
    description: "Toggle safety guard. /safety on | off | status",
    handler: async (args, ctx) => {
      const v = args.trim().toLowerCase();
      if (v === "off") { set(NS, false); ctx.ui.notify("Safety guard OFF — dangerous commands run unchecked.", "warning"); }
      else if (v === "on") { set(NS, true); ctx.ui.notify("Safety guard ON.", "success"); }
      else { ctx.ui.notify(`Safety guard: ${on() ? "ON" : "OFF"}. /safety on|off`, "info"); }
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!on()) return;

    // Secret scanning for write/edit
    if (event.toolName === "write" || event.toolName === "edit") {
      const content = (event.input as any)?.content || (event.input as any)?.text || "";
      const edits = (event.input as any)?.edits;
      let text = typeof content === "string" ? content : "";
      if (edits && Array.isArray(edits)) {
        text = edits.map((e: any) => (e.newText || "") + (e.oldText || "")).join("");
      }
      const secrets = scanSecrets(text);
      if (secrets.length > 0) {
        return {
          block: true,
          reason: `Secret scanner blocked: found ${secrets.join(", ")}. Remove secrets before writing.`,
        };
      }
    }

    const cmd: string | undefined = (event.input as any)?.command;
    if (!cmd) return;

    // Block direct commits to main
    if (/\bgit\s+commit/.test(cmd) && !/\bgit\s+commit\s+--allow-empty\b/.test(cmd)) {
      try {
        const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
        if (branch === "main") {
          return {
            block: true,
            reason: "Direct commits to main are blocked. Create a branch (fix/... or feat/...) and submit a PR.",
          };
        }
      } catch {
        // not a git repo — skip
      }
    }

    const risk = findRisk(cmd);
    if (!risk) return;

    const icon = risk.severity === "destructive" ? "🔥" : "⚠️";
    const detail = risk.detail ? `\n\n${risk.detail}` : "";
    const ok = await ctx.ui.confirm(
      `${icon} Safety: ${risk.label} (${risk.severity})`,
      `${cmd}${detail}\n\nRun this command?`
    );
    if (!ok) return { block: true, reason: `Blocked by safety guard: ${risk.label}. /safety off to disable.` };
  });
}
