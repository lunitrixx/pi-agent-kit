import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { get as configGet, set as configSet, getProject, setProject } from "../../lntrx-config/src/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RuleFile {
  name: string;
  path: string;
}

function getRulesFiles(cwd: string): RuleFile[] {
  const sources = [
    join(cwd, ".pi", "rules"),
    join(cwd, ".claude", "rules"),
  ];

  const rules: RuleFile[] = [];
  const seen = new Set<string>();

  for (const rulesDir of sources) {
    if (!existsSync(rulesDir)) continue;
    const files = readdirSync(rulesDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    for (const file of files) {
      if (!seen.has(file)) {
        seen.add(file);
        rules.push({ name: file, path: join(rulesDir, file) });
      }
    }
  }

  return rules;
}

function readRuleBody(rule: RuleFile): string {
  return readFileSync(rule.path, "utf-8").trim();
}

// ---------------------------------------------------------------------------
// Banner widget (shown above editor on session_start)
// ---------------------------------------------------------------------------

class RulesBanner extends Container {
  private ruleNames: string[];
  private theme: ReturnType<ExtensionAPI["on"]> extends (
    _event: string,
    _handler: (_event: never, ctx: infer C) => unknown,
  ) => unknown
    ? never
    : never;

  constructor(ruleNames: string[], theme: any) {
    super();
    this.ruleNames = ruleNames;
    this.theme = theme;
  }

  override render(width: number): string[] {
    const theme = this.theme as any;
    const lines: string[] = [];
    const accent = (s: string) => theme.fg("accent", s);
    const muted = (s: string) => theme.fg("muted", s);
    const success = (s: string) => theme.fg("success", s);
    const border = (s: string) => theme.fg("border", s);

    // Top border
    const db = new DynamicBorder(border);
    lines.push(...db.render(width));

    // Header
    const count = this.ruleNames.length;
    lines.push(`${theme.bold(accent("[project-rules]"))} ${muted(`${count} active rule${count === 1 ? "" : "s"}`)}`);
    lines.push("");

    // Rules list
    for (const name of this.ruleNames) {
      lines.push(`  ${success("●")} ${name}`);
    }

    // Bottom border
    lines.push("");
    lines.push(...db.render(width));

    return lines;
  }

  override invalidate(): void {}
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let currentRules: RuleFile[] = [];

  function rescan(cwd: string): void {
    currentRules = getRulesFiles(cwd);
  }

  // ---- Visibility helper (project > global > default true) ----
  function isVisible(cwd: string): boolean {
    const p = getProject(cwd, "project-rules.visible");
    if (p !== undefined) return !!p;
    const g = configGet("project-rules.visible");
    if (g !== undefined) return !!g;
    return true;
  }

  // ---- Session start: show banner widget + footer status ----
  pi.on("session_start", async (_event, ctx) => {
    rescan(ctx.cwd);
    if (currentRules.length === 0) return;
    if (!isVisible(ctx.cwd)) return;

    // Banner widget above editor
    ctx.ui.setWidget("project-rules", (_tui: any, theme: any) => {
      return new RulesBanner(currentRules.map((r) => r.name), theme);
    });

    // Footer status
    ctx.ui.setStatus(
      "project-rules",
      `[rules] ${currentRules.length} active`,
    );
  });

  // ---- Before agent start: inject rules into system prompt ----
  pi.on("before_agent_start", async (event, ctx) => {
    rescan(ctx.cwd);
    if (currentRules.length === 0) return;

    const sections = currentRules.map((rule) => {
      const content = readRuleBody(rule);
      return `=== ${rule.name} ===\n${content}`;
    });

    const rulesBlock = [
      "<project_rules>",
      "The following rules from `.pi/rules/` and `.claude/rules/` always apply:",
      "",
      sections.join("\n\n"),
      "</project_rules>",
    ].join("\n");

    return { systemPrompt: event.systemPrompt + "\n\n" + rulesBlock };
  });

  // ---- /rules command ----
  pi.registerCommand("rules", {
    description: "Inspect loaded project rules from .pi/rules/ and .claude/rules/",
    getArgumentCompletions: (prefix) => {
      const subs = ["list", "show", "paths", "status"].filter((s) =>
        s.startsWith(prefix),
      );
      return subs.length > 0 ? subs.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (args, ctx) => {
      rescan(ctx.cwd);
      const tokens = args.trim().split(/\s+/).filter(Boolean);
      const sub = tokens[0] ?? "";

      if (sub === "" || sub === "status") {
        ctx.ui.notify(
          `${currentRules.length} rules in .pi/rules/`,
          "info",
        );
      } else if (sub === "list") {
        const list =
          currentRules.length === 0
            ? "(no rules)"
            : currentRules.map((r) => `  ${r.name}`).join("\n");
        ctx.ui.notify(list, "info");
      } else if (sub === "show") {
        const id = tokens[1];
        if (!id) {
          ctx.ui.notify("Usage: /rules show <name>", "error");
          return;
        }
        const rule = currentRules.find((r) => r.name === id);
        if (!rule) {
          ctx.ui.notify(`Rule not found: ${id}`, "error");
          return;
        }
        ctx.ui.setEditorText(readRuleBody(rule));
      } else if (sub === "paths") {
        const paths =
          currentRules.length === 0
            ? "(no rules)"
            : currentRules.map((r) => r.path).join("\n");
        ctx.ui.notify(paths, "info");
      } else {
        ctx.ui.notify(`Unknown: /rules ${sub}`, "error");
      }
    },
  });

  // ---- /rules toggle - hide/show banner ----
  pi.registerCommand("rules-toggle", {
    description: "Toggle the project-rules banner on/off. /rules-toggle [--global]",
    handler: async (args, ctx) => {
      rescan(ctx.cwd);
      if (currentRules.length === 0) {
        ctx.ui.notify("No project rules loaded", "info");
        return;
      }
      const parts = args.trim().split(/\s+/);
      const global = parts.includes("--global") || parts.includes("-g");
      const currentlyVisible = isVisible(ctx.cwd);

      if (currentlyVisible) {
        ctx.ui.setWidget("project-rules", undefined);
        ctx.ui.setStatus("project-rules", undefined);
      }

      if (global) {
        configSet("project-rules.visible", !currentlyVisible);
      } else {
        setProject(ctx.cwd, "project-rules.visible", !currentlyVisible);
      }

      if (!currentlyVisible) {
        ctx.ui.setWidget("project-rules", (_tui: any, theme: any) => {
          return new RulesBanner(currentRules.map((r) => r.name), theme);
        });
        ctx.ui.setStatus("project-rules", `[rules] ${currentRules.length} active`);
      }

      const scope = global ? "globally" : "for this project";
      const state = !currentlyVisible ? "shown" : "hidden";
      ctx.ui.notify(`Rules banner ${state} ${scope}.`, "info");
    },
  });

  // ---- /reload-rules command ----
  pi.registerCommand("reload-rules", {
    description: "Rescan .pi/rules/ for the current session",
    handler: async (_args, ctx) => {
      rescan(ctx.cwd);
      ctx.ui.notify(
        `Reloaded: ${currentRules.length} rules`,
        "info",
      );
      // Refresh banner widget (respect visibility preference)
      if (currentRules.length > 0 && isVisible(ctx.cwd)) {
        ctx.ui.setWidget("project-rules", (_tui: any, theme: any) => {
          return new RulesBanner(currentRules.map((r) => r.name), theme);
        });
        ctx.ui.setStatus(
          "project-rules",
          `[rules] ${currentRules.length} active`,
        );
      }
    },
  });
}
