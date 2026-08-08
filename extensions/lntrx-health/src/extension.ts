import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanAnatomy, loadIgnorePatterns } from "../../lntrx-memory/src/scanner";

function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf-8", timeout: 10000 }).trim(); } catch { return ""; }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("health", {
    description: "Codebase health: TODOs, complexity, git stats, model info, costs",
    handler: async (args, ctx) => {
      const cwd = ctx.cwd || process.cwd();
      ctx.ui.notify("Analyzing code health...", "info");

      const report: string[] = ["# Code Health — " + (args.trim() || cwd), ""];

      // ---- 1. Anatomy (uses scanner that respects .gitignore) ----
      const anatomy = scanAnatomy(cwd);
      report.push("## Anatomy");
      report.push(`${anatomy.files} files, ~${anatomy.tokens.toLocaleString()} estimated tokens`);
      const byType = Object.entries(anatomy.byExt)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, 8)
        .map(([ext, paths]) => `  ${ext}: ${paths.length} files`);
      if (byType.length) { report.push(...byType); }
      report.push("");

      // ---- 2. TODOs & FIXMEs (walk the scanner-discovered files) ----
      report.push("## TODOs & FIXMEs");
      let todos = 0;
      const todoList: string[] = [];
      const srcExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];
      const codeFiles: string[] = [];
      for (const [ext, paths] of Object.entries(anatomy.byExt)) {
        if (srcExts.includes(ext)) codeFiles.push(...paths);
      }
      for (const rel of codeFiles.slice(0, 500)) {
        const fp = join(cwd, rel);
        try {
          const lines = readFileSync(fp, "utf-8").split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (/TODO|FIXME|HACK|XXX/.test(lines[i])) {
              todos++;
              if (todoList.length < 20) todoList.push(`- \`${rel}:${i + 1}\` — ${lines[i].trim().slice(0, 120)}`);
            }
          }
        } catch { /* permissions */ }
      }
      report.push(`${todos} total. Top 20:`);
      report.push(...todoList);
      report.push("");

      // ---- 3. Large files (>500 lines) ----
      report.push("## Large Files (>500 lines)");
      const large: string[] = [];
      for (const [ext, paths] of Object.entries(anatomy.byExt)) {
        if (!srcExts.includes(ext)) continue;
        for (const rel of paths.slice(0, 200)) {
          const fp = join(cwd, rel);
          try {
            const lines = readFileSync(fp, "utf-8").split("\n").length;
            if (lines > 500) large.push(`- \`${rel}\` — ${lines} lines`);
          } catch {}
        }
      }
      report.push(...(large.length ? large : ["- None"]));
      report.push("");

      // ---- 4. Git stats ----
      report.push("## Git Stats");
      const contributors = sh("git shortlog -sn HEAD | head -5") || "n/a";
      const lastCommit = sh("git log -1 --format='%ar by %an'") || "n/a";
      report.push(`Last commit: ${lastCommit}`);
      report.push(`Top contributors:\n${contributors}`);
      report.push("");

      // ---- 5. Model + context window + cost (from old /ctx) ----
      report.push("## Model & Cost");
      const usage = ctx.getContextUsage();
      const model = ctx.model;
      report.push(`**Model:** ${model?.id ?? "?"}`);
      report.push(`**Window:** ${model?.contextWindow?.toLocaleString() ?? "?"} tokens`);
      if (usage?.limit) {
        const pct = ((usage.tokens / usage.limit) * 100).toFixed(1);
        report.push(`**Used:** ${usage.tokens.toLocaleString()} / ${usage.limit.toLocaleString()} (${pct}%)`);
      }

      let totalCost = 0;
      for (const e of ctx.sessionManager.getBranch()) {
        if (e.type !== "message" || e.message.role !== "assistant") continue;
        totalCost += (e.message as AssistantMessage).usage.cost.total;
      }
      report.push(`**Total cost:** $${totalCost.toFixed(4)}`);

      pi.sendMessage({ customType: "health-report", content: report.join("\n"), display: true });
    },
  });
}