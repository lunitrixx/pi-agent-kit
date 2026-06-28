import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "child_process";
import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { get, set, getProject, setProject } from "../../lntrx-config/src/config";

const NS = "lntrx-guard";

function on(repoPath: string): boolean {
  const g = get(NS);
  if (g !== undefined) return !!g;       // global master switch takes precedence
  const p = getProject(repoPath, NS);
  return p === undefined ? true : !!p;   // on by default
}

interface Risk {
  id: string;             // kebab-case config key suffix, e.g. "force-push"
  pattern: RegExp;
  label: string;
  severity: "destructive" | "risky";
  detail?: string;
}

function riskConfigKey(id: string): string { return `${NS}.risks.${id}`; }

function riskGloballyDisabled(id: string): boolean { return get(riskConfigKey(id)) === false; }

function riskProjectDisabled(repoPath: string, id: string): boolean {
  return getProject(repoPath, riskConfigKey(id)) === false;
}

function riskEnabled(repoPath: string, id: string): boolean {
  if (riskGloballyDisabled(id)) return false;
  if (riskProjectDisabled(repoPath, id)) return false;
  return true;
}

const RISKS: Risk[] = [
  { id: "rm-rf",           pattern: /\brm\s+-rf?\b/,                          label: "Recursive delete",     severity: "destructive", detail: "Irreversible file deletion" },
  { id: "rm-wildcard",     pattern: /\brm\s+.*\*/,                            label: "Wildcard delete",     severity: "destructive", detail: "Deletes everything matching" },
  { id: "sudo",            pattern: /\bsudo\b/,                               label: "Superuser command",   severity: "risky",       detail: "Runs with root privileges" },
  { id: "chmod-777",       pattern: /\bchmod\s+777\b/,                        label: "World-writable chmod",severity: "risky",       detail: "777 opens files to everyone" },
  { id: "chown",           pattern: /\bchown\b/,                              label: "Change ownership",    severity: "risky" },
  { id: "force-push",      pattern: /\bgit\s+push\s+.*--force/,               label: "Force push",          severity: "destructive", detail: "Overwrites remote history" },
  { id: "hard-reset",      pattern: /\bgit\s+reset\s+--hard/,                 label: "Hard reset",          severity: "destructive", detail: "Discards all uncommitted changes" },
  { id: "git-clean",       pattern: /\bgit\s+clean\b/,                        label: "Git clean",           severity: "destructive", detail: "Removes untracked files" },
  { id: "dd",              pattern: /\bdd\s+if=/,                             label: "Disk copy (dd)",      severity: "destructive", detail: "Can overwrite disks" },
  { id: "docker-prune",    pattern: /\bdocker\s+system\s+prune/,              label: "Docker prune",        severity: "risky",       detail: "Removes all unused Docker data" },
  { id: "docker-rm",       pattern: /\bdocker\s+rm\b/,                        label: "Docker remove",       severity: "risky" },
  { id: "drop-database",   pattern: /\bdrop\s+database\b/i,                   label: "Drop database",       severity: "destructive", detail: "Destroys database permanently" },
  { id: "drop-table",      pattern: /\bdrop\s+table\b/i,                      label: "Drop table",          severity: "destructive", detail: "Destroys table permanently" },
  { id: "pip-uninstall",   pattern: /\bpip\s+uninstall\b/,                    label: "Pip uninstall",       severity: "risky" },
  { id: "npm-uninstall",   pattern: /\bnpm\s+uninstall\b/,                    label: "npm uninstall",       severity: "risky" },
  { id: "sops-wildcard",   pattern: /\bsops\s+.*\*/,                           label: "SOPS wildcard decrypt",severity: "destructive", detail: "Decrypts all matching secret files at once" },
  { id: "pipe-shell",      pattern: /\b(curl|wget)\s+.*\|.*\b(bash|sh)\b/, label: "Pipe to shell",        severity: "destructive", detail: "Executes remote script directly — supply-chain risk" },
  { id: "push-delete",     pattern: /\bgit\s+push\s+.*--delete\b/,           label: "Git push --delete",    severity: "destructive", detail: "Deletes remote branch permanently" },
  { id: "package-publish", pattern: /\b(npm|yarn)\s+publish\b/,              label: "Package publish",      severity: "risky",       detail: "Publishes to registry — accidental releases are hard to undo" },
];

function findRisk(cmd: string, repoPath: string): Risk | undefined {
  return RISKS.find((r) => r.pattern.test(cmd) && riskEnabled(repoPath, r.id));
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
// Git hooks — block direct commits to main
// ---------------------------------------------------------------------------

const PRE_COMMIT_HOOK = `#!/bin/sh
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


interface HookDef {
  name: string;          // file name in .git/hooks/
  configKey: string;     // full dotted namespace key (same in global and project config)
  script: string;
}

const HOOKS: HookDef[] = [
  { name: "pre-commit", configKey: "lntrx-guard.git-hooks.block-main-commit", script: PRE_COMMIT_HOOK },
];

function hookGloballyDisabled(configKey: string): boolean {
  return get(configKey) === false;
}

function hookProjectDisabled(repoPath: string, configKey: string): boolean {
  return getProject(repoPath, configKey) === false;
}

function hookEnabled(repoPath: string, hook: HookDef): boolean {
  if (hookGloballyDisabled(hook.configKey)) return false;
  if (hookProjectDisabled(repoPath, hook.configKey)) return false;
  return true;
}

function hookInstalled(repoPath: string, hook: HookDef): boolean {
  if (!existsSync(join(repoPath, ".git"))) return true; // not a repo, skip
  try {
    const content = execSync(`cat .git/hooks/${hook.name}`, { encoding: "utf-8", cwd: repoPath });
    return content.includes("lntrx-guard");
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

export default function (pi: ExtensionAPI) {
  // ---- Session start: sync all git hooks ----
  pi.on("session_start", async (_event, ctx) => {
    if (!on(ctx.cwd)) return;
    for (const hook of HOOKS) {
      if (!hookEnabled(ctx.cwd, hook)) {
        if (hookInstalled(ctx.cwd, hook)) {
          removeHook(ctx.cwd, hook);
          ctx.ui.notify(`lntrx-guard: ${hook.name} hook removed (disabled by config).`, "warning");
        }
        continue;
      }
      if (!hookInstalled(ctx.cwd, hook)) {
        installHook(ctx.cwd, hook);
        ctx.ui.notify(`lntrx-guard: Installed ${hook.name} hook.`, "success");
      }
    }
  });

  // ---- /guard-hook command ----
  pi.registerCommand("guard-hook", {
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
      // Resolve hook name argument (strip known flags)
      const hookName = parts.filter((p) => !["disable","enable","install","uninstall","remove","status","--global","-g"].includes(p))[0];
      const targets = hookName ? HOOKS.filter((h) => h.name === hookName) : HOOKS;

      if (sub === "disable") {
        for (const hook of targets) {
          if (global) {
            set(hook.configKey, false);
          } else {
            setProject(ctx.cwd, hook.configKey, false);
          }
          if (hookInstalled(ctx.cwd, hook)) removeHook(ctx.cwd, hook);
        }
        const scope = global ? "globally" : "for this project";
        const names = targets.map((h) => h.name).join(", ");
        ctx.ui.notify(`Hooks disabled ${scope}: ${names}. /guard-hook enable to undo.`, "warning");
        return;
      }

      if (sub === "enable") {
        for (const hook of targets) {
          if (global) {
            set(hook.configKey, undefined);
          } else {
            setProject(ctx.cwd, hook.configKey, undefined);
          }
          if (hookEnabled(ctx.cwd, hook) && !hookInstalled(ctx.cwd, hook)) {
            installHook(ctx.cwd, hook);
          }
        }
        const scope = global ? "globally" : "for this project";
        const names = targets.map((h) => h.name).join(", ");
        ctx.ui.notify(`Hooks enabled ${scope}: ${names}.`, "success");
        return;
      }

      if (sub === "uninstall" || sub === "remove") {
        let removed = 0;
        for (const hook of targets) {
          if (removeHook(ctx.cwd, hook)) removed++;
        }
        ctx.ui.notify(removed > 0 ? `${removed} hook(s) removed.` : "No hooks to remove.", removed > 0 ? "warning" : "info");
        return;
      }

      if (sub === "install") {
        let installed = 0;
        for (const hook of targets) {
          if (installHook(ctx.cwd, hook)) installed++;
        }
        ctx.ui.notify(installed > 0 ? `${installed} hook(s) installed.` : "Not a git repo.", installed > 0 ? "success" : "error");
        return;
      }

      // Default: status
      const lines: string[] = [];
      for (const hook of HOOKS) {
        const globalOff = hookGloballyDisabled(hook.configKey);
        const projectOff = hookProjectDisabled(ctx.cwd, hook.configKey);
        const fileOk = hookInstalled(ctx.cwd, hook);

        let state: string;
        if (globalOff) state = "OFF (global)";
        else if (projectOff) state = "OFF (project)";
        else if (fileOk) state = "ON";
        else state = "MISSING";

        lines.push(`  ${hook.name}: ${state}  [${hook.configKey}]`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("safety", {
    description: "Manage safety guard. /safety on|off [--global] | /safety risk enable|disable|list [--global] [<risk-id>]",
    getArgumentCompletions: (prefix) => {
      const top = ["on", "off", "status", "risk"];
      const match = top.filter((s) => s.startsWith(prefix));
      return match.length > 0 ? match.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0];
      const global = parts.includes("--global") || parts.includes("-g");

      // ---- risk subcommand ----
      if (sub === "risk") {
        const action = parts[1]; // enable | disable | list
        const idArg = parts.filter((p) => !["risk","enable","disable","list","status","--global","-g"].includes(p))[0];
        const targets = idArg ? RISKS.filter((r) => r.id === idArg) : RISKS;

        if (action === "disable") {
          if (targets.length === 0) { ctx.ui.notify(`Unknown risk: ${idArg}`, "error"); return; }
          for (const r of targets) {
            if (global) {
              set(riskConfigKey(r.id), false);
            } else {
              setProject(ctx.cwd, riskConfigKey(r.id), false);
            }
          }
          const scope = global ? "globally" : "for this project";
          const names = targets.map((r) => r.id).join(", ");
          ctx.ui.notify(`Risk(s) disabled ${scope}: ${names}. /safety risk enable ${idArg || "<id>"} to undo.`, "warning");
          return;
        }

        if (action === "enable") {
          if (targets.length === 0) { ctx.ui.notify(`Unknown risk: ${idArg}`, "error"); return; }
          for (const r of targets) {
            if (global) {
              set(riskConfigKey(r.id), undefined);
            } else {
              setProject(ctx.cwd, riskConfigKey(r.id), undefined);
            }
          }
          const scope = global ? "globally" : "for this project";
          const names = targets.map((r) => r.id).join(", ");
          ctx.ui.notify(`Risk(s) enabled ${scope}: ${names}.`, "success");
          return;
        }

        // Default: list
        const lines: string[] = [`Safety risks (${on(ctx.cwd) ? "guard ON" : "guard OFF"}):`, ""];
        for (const r of RISKS) {
          const gOff = riskGloballyDisabled(r.id);
          const pOff = riskProjectDisabled(ctx.cwd, r.id);
          let state: string;
          if (gOff) state = "OFF (global)";
          else if (pOff) state = "OFF (project)";
          else state = "ON";
          const icon = r.severity === "destructive" ? "🔥" : "⚠️";
          lines.push(`  ${icon} ${r.id.padEnd(18)} ${state.padEnd(16)} ${r.label}`);
        }
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      // ---- top-level on/off ----
      if (sub === "off") {
        if (global) { set(NS, false); } else { setProject(ctx.cwd, NS, false); }
        const scope = global ? "globally" : "for this project";
        ctx.ui.notify(`Safety guard OFF ${scope} — dangerous commands run unchecked.`, "warning");
      }
      else if (sub === "on") {
        if (global) { set(NS, undefined); } else { setProject(ctx.cwd, NS, undefined); }
        const scope = global ? "globally" : "for this project";
        ctx.ui.notify(`Safety guard ON ${scope}.`, "success");
      }
      else {
        const gOff = get(NS) === false;
        const pOff = getProject(ctx.cwd, NS) === false;
        const state = gOff ? "OFF (global)" : pOff ? "OFF (project)" : "ON";
        ctx.ui.notify(`Safety guard: ${state}. /safety on|off [--global] | /safety risk list`, "info");
      }
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!on(ctx.cwd)) return;

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

    const risk = findRisk(cmd, ctx.cwd);
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
