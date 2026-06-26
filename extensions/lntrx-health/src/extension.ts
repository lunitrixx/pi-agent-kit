import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

function sh(cmd: string): string { try { return execSync(cmd, { encoding: "utf-8", timeout: 10000 }).trim(); } catch { return ""; } }

function scanFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  const ignore = new Set(["node_modules", ".git", ".pi", ".lntrx", "dist", "build", "__pycache__", ".next", "target", "vendor"]);
  function walk(d: string) {
    try { for (const f of readdirSync(d)) {
      if (ignore.has(f) || f.startsWith(".")) continue;
      const full = join(d, f);
      try {
        const st = statSync(full);
        if (st.isDirectory()) { walk(full); continue; }
        if (exts.includes(extname(f).toLowerCase())) results.push(full);
      } catch {}
    }} catch {}
  }
  walk(dir);
  return results;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("health", {
    description: "Codebase health check: TODOs, complexity, dead code, stale deps",
    handler: async (args, ctx) => {
      const cwd = process.cwd();
      ctx.ui.notify("Analyzing code health...", "info");

      const report: string[] = ["# Code Health — " + (args.trim() || cwd), ""];

      // 1. TODOs and FIXMEs
      report.push("## TODOs & FIXMEs");
      const srcExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];
      const files = scanFiles(cwd, srcExts);
      let todos = 0;
      const todoList: string[] = [];
      for (const f of files.slice(0, 500)) {
        try {
          const lines = readFileSync(f, "utf-8").split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (/TODO|FIXME|HACK|XXX/.test(lines[i])) {
              todos++;
              if (todoList.length < 20) todoList.push(`- \`${f}:${i + 1}\` — ${lines[i].trim().slice(0, 120)}`);
            }
          }
        } catch {}
      }
      report.push(`${todos} total. Top 20:`);
      report.push(...todoList);
      report.push("");

      // 2. Large files
      report.push("## Large Files (>500 lines)");
      const large: string[] = [];
      for (const f of files) {
        try {
          const lines = readFileSync(f, "utf-8").split("\n").length;
          if (lines > 500) large.push(`- \`${f}\` — ${lines} lines`);
        } catch {}
      }
      report.push(...(large.length ? large : ["- None"]));
      report.push("");

      // 3. Git stats
      report.push("## Git Stats");
      const contributors = sh("git shortlog -sn HEAD | head -5") || "n/a";
      const lastCommit = sh("git log -1 --format='%ar by %an'") || "n/a";
      report.push(`Last commit: ${lastCommit}`);
      report.push(`Top contributors:\n${contributors}`);
      report.push("");

      // 4. Dependency check
      report.push("## Dependencies");
      if (existsSync(join(cwd, "package.json"))) {
        const outdated = sh("npm outdated --json 2>/dev/null");
        if (outdated) {
          try {
            const deps = JSON.parse(outdated);
            const names = Object.keys(deps);
            report.push(`${names.length} outdated:`);
            for (const n of names.slice(0, 10)) {
              report.push(`- ${n}: ${deps[n].current} → ${deps[n].latest}`);
            }
          } catch { report.push("Could not parse outdated deps."); }
        } else {
          report.push("All dependencies up to date.");
        }
      } else {
        report.push("No package.json found.");
      }
      report.push("");

      pi.sendMessage({ customType: "health-report", content: report.join("\n"), display: true });
    },
  });
}
