/**
 * lntrx-permit — permission system for pi-coding-agent
 *
 * Replaces lntrx-guard's regex-based approach with a normalizing shell
 * tokenizer and four permission surfaces (path, external_directory, tool,
 * bash). Uses most-restrictive-wins evaluation with fail-closed defaults.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { normalizeCommand } from "./shell.js";
import {
  checkPath,
  checkTool,
  checkBash,
  checkExternalDirectory,
  mostRestrictive,
  applyFailClosed,
  parsePathRules,
  parseToolRules,
  parseBashRules,
} from "./rules.js";
import type { SurfaceResults, Decision } from "./rules.js";
import { redactToolResult } from "./redact.js";
import { loadConfig, migrateOldRisks } from "./config.js";
import { loadApprovals, clearApprovals, getApprovalsPatterns, isApproved, addApproval, promptPermit, yoloWarning } from "./ui.js";

// ---------------------------------------------------------------------------
// Path extraction helpers
// ---------------------------------------------------------------------------

function extractPaths(event: any, cwd: string): string[] {
  const paths: string[] = [];
  const input = event.input || {};

  // Read events
  if (input.path) paths.push(input.path);
  if (input.filePath) paths.push(input.filePath);

  // Write events
  if (input.filePath) paths.push(input.filePath);

  // Edit events
  if (input.filePath) paths.push(input.filePath);

  // Grep/ls/find events
  if (input.directory) paths.push(input.directory);
  if (input.path) paths.push(input.path);

  // Bash events — extract arguments that look like paths
  if (input.command && typeof input.command === "string") {
    const cmd = normalizeCommand(input.command);
    for (const arg of cmd.args) {
      if (arg.startsWith("/") || arg.startsWith("./") || arg.startsWith("../") || arg === "." || arg === "..") {
        paths.push(arg);
      }
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Tool name extraction
// ---------------------------------------------------------------------------

function getToolName(event: any): string {
  return event.toolName || event.name || "";
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let yolo = false;
  let yoloWarned = false;

  // Register --yolo flag
  pi.registerFlag("yolo", { type: "boolean", default: false });

  // ---- Session start ----
  pi.on("session_start", async (_event, ctx) => {
    yolo = !!pi.getFlag("yolo");
    yoloWarned = false;

    // Session approvals start fresh — pi.getEntry not available in current API

    // If YOLO mode, show warning once in the header
    if (yolo) {
      ctx.ui.setStatus("permit", "🛡️ YOLO");
    } else {
      ctx.ui.setStatus("permit", "🛡️");
    }
  });

  // ---- Tool hiding ----
  pi.on("before_agent_start", async (_event, ctx) => {
    if (yolo) return;

    const config = loadConfig(ctx.cwd);
    const toolRules = parseToolRules(config.tool);

    if (toolRules.length === 0) return;

    try {
      const allTools = pi.getAllTools();
      const active = pi.getActiveTools();
      const blocked: string[] = [];

      for (const tool of allTools) {
        if (!active.includes(tool.name)) continue;
        const decision = checkTool(tool.name, toolRules);
        if (decision === "deny") {
          blocked.push(tool.name);
        }
      }

      if (blocked.length > 0) {
        pi.setActiveTools(active.filter((t) => !blocked.includes(t)));
      }
    } catch {
      // getAllTools/setActiveTools might not be available mid-session
    }
  });

  // ---- Main tool_call gate ----
  pi.on("tool_call", async (event, ctx) => {
    if (yolo) return;

    const config = loadConfig(ctx.cwd);
    const toolName = getToolName(event);

    // --- Path surface ---
    const pathRules = parsePathRules(config.path);
    let pathDecision: Decision = "allow";
    const paths = extractPaths(event, ctx.cwd);
    for (const p of paths) {
      const d = checkPath(p, pathRules, ctx.cwd);
      if (d !== "allow") pathDecision = d; // last-match-wins, but we want restrictiveness
    }

    // --- External directory surface ---
    let extDirDecision: Decision = "allow";
    for (const p of paths) {
      const d = checkExternalDirectory(p, config.external_directory, ctx.cwd);
      if (d !== "allow") extDirDecision = d;
    }

    // --- Tool surface ---
    const toolRules = parseToolRules(config.tool);
    const toolDecision = checkTool(toolName, toolRules);

    // --- Bash surface ---
    let bashDecision: Decision = "allow";
    let unparseable = false;
    let matchedBashPattern = "";
    const cmd = (event.input as any)?.command;
    if (cmd && typeof cmd === "string") {
      const normalized = normalizeCommand(cmd);
      unparseable = normalized.unparseable;
      const bashRules = parseBashRules(config.bash);
      // Find matching pattern for reporting
      for (const rule of bashRules) {
        // Simple glob match against canonical
        const re = new RegExp("^" + rule.pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
        if (re.test(normalized.canonical)) {
          bashDecision = rule.decision;
          matchedBashPattern = rule.pattern;
        }
      }
    }

    // --- Evaluate ---
    let results: SurfaceResults = {
      path: pathDecision,
      externalDirectory: extDirDecision,
      tool: toolDecision,
      bash: bashDecision,
    };

    // Fail-closed: escalate unparseable commands
    results = applyFailClosed(results, unparseable, ctx.hasUI);

    const decision = mostRestrictive(results);

    if (decision === "allow") return;

    // Check session approvals first
    const blockingSurface = results.bash !== "allow" ? "bash" :
      results.path !== "allow" ? "path" :
      results.tool !== "allow" ? "tool" : "external_directory";

    if (blockingSurface === "bash" && matchedBashPattern && isApproved(matchedBashPattern)) {
      return; // Session-approved
    }

    if (decision === "deny") {
      return {
        block: true,
        reason: `Permission denied by ${blockingSurface} surface.${unparseable ? " Command was unparseable (fail-closed)." : ""}${matchedBashPattern ? ` Rule: ${matchedBashPattern}` : ""}`,
      };
    }

    // decision === "ask" — prompt the user
    if (decision === "ask") {
      const label = cmd ? `Command: ${cmd.slice(0, 100)}` : `Tool: ${toolName}`;
      const choice = await promptPermit(
        ctx,
        label,
        matchedBashPattern || `${blockingSurface} surface`,
        unparseable ? "Command could not be fully parsed — proceed with caution." : undefined,
      );

      if (!choice || choice === "deny") {
        return { block: true, reason: `Blocked by user.` };
      }

      if (choice === "session" && matchedBashPattern) {
        addApproval(matchedBashPattern, pi);
      }

      // "once" — allowed, fall through
    }
  });

  // ---- Tool result redaction ----
  pi.on("tool_result", async (event) => {
    if (yolo) return;
    // Redact secrets from result content
    if (event.result && event.result.content) {
      return {
        ...event.result,
        content: redactToolResult(event.result.content),
      };
    }
  });

  // ---- User-typed bash ----
  pi.on("user_bash", async (event, ctx) => {
    if (yolo) return;
    const config = loadConfig(ctx.cwd);
    const cmd = event.command;
    if (!cmd) return;

    const normalized = normalizeCommand(cmd);
    const bashRules = parseBashRules(config.bash);
    let decision: Decision = "allow";
    let matchedPattern = "";

    for (const rule of bashRules) {
      const re = new RegExp("^" + rule.pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
      if (re.test(normalized.canonical)) {
        decision = rule.decision;
        matchedPattern = rule.pattern;
      }
    }

    // Fail-closed for unparseable
    if (normalized.unparseable && decision === "allow") {
      decision = ctx.hasUI ? "ask" : "deny";
    }
    if (normalized.unparseable && decision === "ask" && !ctx.hasUI) {
      decision = "deny";
    }

    if (decision === "allow") return;
    if (decision === "deny") {
      return { block: true, reason: `Permission denied.${normalized.unparseable ? " Command unparseable (fail-closed)." : ""}` };
    }

    if (matchedPattern && isApproved(matchedPattern)) return;

    const choice = await promptPermit(ctx, `Command: ${cmd.slice(0, 100)}`, matchedPattern || "bash surface");
    if (!choice || choice === "deny") {
      return { block: true, reason: "Blocked by user." };
    }
    if (choice === "session" && matchedPattern) {
      addApproval(matchedPattern, pi);
    }
  });

  // ---- /permit command ----
  pi.registerCommand("permit", {
    description: "Manage permission system. /permit status|approvals|migrate",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0];

      // /permit approvals — list session approvals
      if (sub === "approvals") {
        if (parts[1] === "clear") {
          clearApprovals();
          pi.appendEntry("permit-approvals", []);
          ctx.ui.notify("Session approvals cleared.", "success");
          return;
        }
        const patterns = getApprovalsPatterns();
        if (patterns.length === 0) {
          ctx.ui.notify("No session approvals.", "info");
        } else {
          ctx.ui.notify(`Session approvals:\n${patterns.map((p) => `  ${p}`).join("\n")}`, "info");
        }
        return;
      }

      // /permit migrate — migrate old lntrx-guard.risks.* keys
      if (sub === "migrate") {
        const migration = migrateOldRisks(ctx.cwd);
        if (Object.keys(migration.rules).length === 0 && migration.unmapped.length === 0) {
          ctx.ui.notify("No old lntrx-guard.risks.* keys found to migrate.", "info");
          return;
        }

        const lines: string[] = ["Migration result:"];
        for (const [pattern, decision] of Object.entries(migration.rules)) {
          lines.push(`  ${pattern} → ${decision}`);
        }
        if (migration.unmapped.length > 0) {
          lines.push(`Unmapped risks: ${migration.unmapped.join(", ")}`);
        }
        lines.push("");
        lines.push("Add these to ~/.pi/agent/pi-agent-kit.json under lntrx-permit.bash to apply.");
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      // /permit status — show current config
      const config = loadConfig(ctx.cwd);
      const yoloStatus = yolo ? " (--yolo: ALL BYPASSED)" : "";
      const lines: string[] = [`Permit: default=${config.default}${yoloStatus}`, ""];

      if (config.path) {
        lines.push("Path rules:");
        for (const [pattern, decision] of Object.entries(config.path)) {
          lines.push(`  ${pattern} → ${decision}`);
        }
      }
      if (config.external_directory) {
        lines.push(`External directory: ${config.external_directory}`);
      }
      if (config.tool) {
        lines.push("Tool rules:");
        for (const [pattern, decision] of Object.entries(config.tool)) {
          lines.push(`  ${pattern} → ${decision}`);
        }
      }
      if (config.bash) {
        lines.push("Bash rules:");
        for (const [pattern, decision] of Object.entries(config.bash)) {
          lines.push(`  ${pattern} → ${decision}`);
        }
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}