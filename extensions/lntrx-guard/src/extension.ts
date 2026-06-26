import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "child_process";
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

export default function (pi: ExtensionAPI) {
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
