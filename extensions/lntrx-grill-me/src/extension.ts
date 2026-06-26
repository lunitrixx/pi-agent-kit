import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Intent = "auto" | "plan" | "learn" | "research" | "content" | "decide";
type ResearchMode = "off" | "ask" | "auto";
type Phase = "interview" | "output-selection" | "output";

interface GrillState {
  active: boolean;
  topic: string;
  intent: Intent;
  researchMode: ResearchMode;
  checkpoint: string;
  phase: Phase;
  outputPlan?: string;
  currentQuestion?: string;
  updatedAt: number;
}

const STATE_TYPE = "grill-me-state";

const DEFAULT_STATE: GrillState = {
  active: false,
  topic: "",
  intent: "auto",
  researchMode: "auto",
  checkpoint: "",
  phase: "interview",
  updatedAt: Date.now(),
};

const OUTPUT_OPTIONS = [
  "GitHub issues", "Design doc", "README.md", "ADR", "PRD",
  "Implementation plan", "Research brief", "Summary / decision memo",
  "Tutorial / content outline", "Test plan / QA checklist", "Changelog / release notes",
];

function describeOptions(): string {
  return OUTPUT_OPTIONS.map((o) => `- ${o}`).join("\n");
}

function initialCheckpoint(topic: string, state: GrillState): string {
  return `# Shared Understanding

## Topic

${topic}

## Current Understanding

Starting grill session to reach shared understanding before producing outputs or implementation work.

- Intent: ${state.intent}
- Research mode: ${state.researchMode}

## Decisions
*(record decisions as they are made)*

## Assumptions
*(record assumptions as they are surfaced)*

## Risks / Unknowns
*(record risks and unknowns as they are identified)*

## Coverage Checklist
- [ ] Desired outcome and success criteria
- [ ] Scope boundaries and non-goals
- [ ] User/audience/stakeholder context
- [ ] Constraints, dependencies, resources
- [ ] Alternatives, tradeoffs, decision criteria
- [ ] Risks, failure modes, edge cases
- [ ] Validation, testing, evidence plan
- [ ] Rollout/next steps and ownership

## Decision Branches
- Root: clarify desired outcome and success criteria

## Open Questions
- What outcome is the user trying to achieve?
- What constraints shape the next branch of questioning?

## Available Output Destinations
${describeOptions()}
`;
}

function cloneState(state: GrillState): GrillState {
  return JSON.parse(JSON.stringify(state));
}

function isProbablyReadOnlyBash(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return true;
  if (/(^|[^<])>(>|&)?\s*\S/.test(trimmed) || /\btee\b/.test(trimmed)) return false;
  const mutating = /\b(rm|mv|cp|mkdir|rmdir|touch|chmod|chown|sudo|kill|pkill|reboot|shutdown)\b/;
  if (mutating.test(trimmed)) return false;
  const unsafe = [
    "git add", "git commit", "git push", "git checkout", "git switch",
    "git reset", "git merge", "git rebase", "npm install", "npm i",
    "pnpm install", "yarn add", "pip install", "cargo install",
  ];
  if (unsafe.some((u) => trimmed.toLowerCase().includes(u))) return false;
  for (const seg of trimmed.split(/&&|\|\||;|\n/).map((s) => s.trim()).filter(Boolean)) {
    const cmd = seg.split(/\s+/)[0];
    if (!cmd) continue;
    if (["cat", "head", "tail", "less", "grep", "rg", "find", "fd", "ls", "pwd", "tree", "wc", "sort", "uniq", "cut", "awk", "sed", "date", "whoami", "uname", "echo", "gh", "git"].includes(cmd)) continue;
    return false;
  }
  return true;
}

export default function (pi: ExtensionAPI) {
  let state = cloneState(DEFAULT_STATE);

  function persist(): void {
    state.updatedAt = Date.now();
    pi.appendEntry(STATE_TYPE, cloneState(state));
  }

  function updateUi(ctx: ExtensionContext): void {
    if (!state.active) {
      ctx.ui.setStatus("grill-me", undefined);
      return;
    }
    const label = state.phase === "output" ? "🔥 grill: output" : state.phase === "output-selection" ? "🔥 grill: select" : "🔥 grill";
    ctx.ui.setStatus("grill-me", ctx.ui.theme.fg("accent", label));
  }

  function startSession(topic: string, ctx: ExtensionContext, partial: Partial<GrillState> = {}): void {
    state = { ...cloneState(DEFAULT_STATE), ...partial, active: true, topic, phase: "interview" };
    state.checkpoint = initialCheckpoint(topic, state);
    persist();
    updateUi(ctx);

    pi.sendUserMessage(
      `Start a Grill Me session for this topic:\n\n${topic}\n\n` +
      `Begin by updating the checkpoint if needed, then ask the first focused Socratic question. ` +
      `Use the thorough grilling style. Update the checkpoint with grill_update_checkpoint whenever ` +
      `shared understanding changes meaningfully. When the interview is ready to end, enter the ` +
      `mandatory output-selection phase with grill_enter_output_selection before producing outputs or stopping.`
    );
  }

  pi.registerCommand("grill-me", {
    description: "Start a Socratic Grill Me planning session",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const firstWord = trimmed.split(/\s+/, 1)[0]?.toLowerCase() ?? "";

      if (firstWord === "stop") {
        state.active = false;
        state.phase = "interview";
        persist();
        updateUi(ctx);
        ctx.ui.notify("Grill mode stopped.", "info");
        return;
      }

      if (firstWord === "status") {
        const phaseLabel = state.phase === "output" ? "output production; mutations allowed" : state.phase === "output-selection" ? "mandatory output selection" : "read-only interview";
        pi.sendMessage({
          customType: "grill-me-status",
          content: `**Active:** ${state.active}\n**Topic:** ${state.topic || "(none)"}\n**Intent:** ${state.intent}\n**Phase:** ${phaseLabel}\n**Research:** ${state.researchMode}\n**Checkpoint updated:** ${new Date(state.updatedAt).toLocaleString()}`,
          display: true,
        });
        return;
      }

      if (firstWord === "intent") {
        const value = trimmed.split(/\s+/, 2)[1];
        if (!value || !["auto", "plan", "learn", "research", "content", "decide"].includes(value)) {
          ctx.ui.notify("Usage: /grill-me intent auto|plan|learn|research|content|decide", "warning");
          return;
        }
        state.intent = value as Intent;
        persist();
        ctx.ui.notify(`Intent set to: ${value}`, "info");
        return;
      }

      if (firstWord === "research") {
        const value = trimmed.split(/\s+/, 2)[1];
        if (!value || !["off", "ask", "auto"].includes(value)) {
          ctx.ui.notify("Usage: /grill-me research off|ask|auto", "warning");
          return;
        }
        state.researchMode = value as ResearchMode;
        persist();
        ctx.ui.notify(`Research mode set to: ${value}`, "info");
        return;
      }

      if (firstWord === "checkpoint") {
        pi.sendMessage({ customType: "grill-me-checkpoint", content: state.checkpoint, display: true });
        return;
      }

      if (!trimmed) {
        // Infer topic from conversation
        const topic = await ctx.ui.editor("What should I grill you about?", "");
        if (!topic?.trim()) {
          ctx.ui.notify("Cancelled.", "info");
          return;
        }
        startSession(topic.trim(), ctx);
        return;
      }

      startSession(trimmed, ctx);
    },
  });

  pi.registerTool({
    name: "grill_update_checkpoint",
    label: "Update Checkpoint",
    description: "Replace the Grill Me shared-understanding checkpoint. Call whenever meaningful understanding changes.",
    promptSnippet: "Persist evolving Grill Me checkpoint",
    promptGuidelines: [
      "Call before asking the next question whenever shared understanding changes.",
      "Update coverage checklist branches as they are resolved or deferred.",
    ],
    parameters: Type.Object({
      markdown: Type.String({ description: "Full replacement checkpoint Markdown." }),
      changeSummary: Type.String({ description: "Brief summary of what changed." }),
    }),
    async execute(_id, params) {
      if (!state.active) return { content: [{ type: "text", text: "No active grill session." }], isError: true };
      state.checkpoint = params.markdown;
      persist();
      return { content: [{ type: "text", text: `Checkpoint updated: ${params.changeSummary}` }] };
    },
  });

  pi.registerTool({
    name: "grill_enter_output_selection",
    label: "Enter Output Selection",
    description: "Enter the mandatory output-selection phase. The interview is done — user must choose what outputs to produce.",
    promptSnippet: "Start mandatory output-selection phase",
    promptGuidelines: [
      "Call when shared understanding is sufficient to leave interview mode.",
      `Explicitly list output options: ${OUTPUT_OPTIONS.join(", ")}.`,
      "Ask the user to choose one or more, continue grilling, or stop without output.",
    ],
    parameters: Type.Object({
      readinessRationale: Type.String({ description: "Why the interview is ready to end." }),
      recommendedOutputs: Type.String({ description: "Recommended output destination(s)." }),
      question: Type.String({ description: "The output-selection question for the user." }),
    }),
    async execute(_id, params) {
      if (!state.active) return { content: [{ type: "text", text: "No active grill session." }], isError: true };
      state.phase = "output-selection";
      state.currentQuestion = params.question;
      persist();
      return {
        content: [{
          type: "text",
          text: `Output-selection phase active.\n\nOutput options:\n${describeOptions()}\n\nRecommended: ${params.recommendedOutputs}\n\nQuestion: ${params.question}`
        }],
      };
    },
  });

  pi.registerTool({
    name: "grill_enter_output_phase",
    label: "Enter Output Phase",
    description: "User approved output production. Mutations are now allowed.",
    promptSnippet: "Enter approved output-production phase",
    promptGuidelines: [
      "Only call after grill_enter_output_selection ran and user approved concrete outputs.",
      "During output phase, create only the approved artifacts.",
      "If a mutation is blocked by permissions/auth, ask the user instead of bypassing.",
    ],
    parameters: Type.Object({
      outputPlan: Type.String({ description: "Approved output plan including artifacts and tool use." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!state.active) return { content: [{ type: "text", text: "No active grill session." }], isError: true };
      if (state.phase !== "output-selection") {
        return {
          content: [{ type: "text", text: "Must complete output selection first. Call grill_enter_output_selection." }],
          isError: true,
        };
      }
      state.phase = "output";
      state.outputPlan = params.outputPlan;
      persist();
      if (ctx) updateUi(ctx);
      return { content: [{ type: "text", text: `Output phase active for plan:\n${params.outputPlan}` }] };
    },
  });

  pi.registerTool({
    name: "grill_finish",
    label: "Finish Grill",
    description: "End the grill session. Saves checkpoint and Q&A summary to GRILL-ME.md.",
    promptSnippet: "Finish grill session and save results",
    promptGuidelines: ["Call when the session is complete and outputs are produced (or user chose to stop)."],
    parameters: Type.Object({
      summary: Type.String({ description: "Final summary of what was understood and decided." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!state.active) return { content: [{ type: "text", text: "No active grill session." }], isError: true };

      const outPath = join(ctx.cwd, "GRILL-ME.md");
      const md = `# Grill Me Results — ${state.topic}\n\n` +
        `**Intent:** ${state.intent}\n` +
        `**Completed:** ${new Date().toISOString()}\n\n` +
        `## Summary\n\n${params.summary}\n\n` +
        `## Checkpoint\n\n${state.checkpoint}\n`;

      await mkdir(join(ctx.cwd, ".pi", "grill-me"), { recursive: true });
      await writeFile(outPath, md);

      state.active = false;
      state.phase = "interview";
      persist();
      if (ctx) updateUi(ctx);

      return { content: [{ type: "text", text: `Grill complete. Results saved to ${outPath}` }] };
    },
  });

  // Read-only enforcement during interview
  pi.on("tool_call", async (event) => {
    if (!state.active || state.phase === "output") return;

    if (event.toolName === "edit" || event.toolName === "write") {
      return {
        block: true,
        reason: "Grill Me is read-only until output selection runs and user approves output production.",
      };
    }

    if (event.toolName === "bash") {
      const command = String((event.input as any)?.command ?? "");
      if (!isProbablyReadOnlyBash(command)) {
        return {
          block: true,
          reason: `Grill Me blocked a potentially mutating command. Complete output selection first.\nCommand: ${command}`,
        };
      }
    }
  });

  // Prompt injection
  pi.on("before_agent_start", async (event) => {
    if (!state.active) return;

    const researchGuide = {
      off: "Do not inspect code/files unless the user explicitly provides context.",
      ask: "Ask permission before inspecting files or code.",
      auto: "If a question can be answered by inspecting the codebase, inspect instead of asking. Use read-only tools.",
    };

    const phaseGuide =
      state.phase === "output"
        ? "You are in output phase. Produce only the approved outputs. If blocked by permissions, ask the user."
        : state.phase === "output-selection"
          ? `You are in mandatory output-selection phase. Available outputs:\n${describeOptions()}\n\n` +
            "Ask the user to choose outputs, continue grilling, or stop. Do not ask new interview questions."
          : "You are in read-only interview mode. Do not implement, write files, or run mutating commands. " +
            "When ready, call grill_enter_output_selection before stopping or producing outputs.";

    const inject = [
      "You are conducting a Grill Me session — a thorough Socratic interview.",
      "",
      `Topic: ${state.topic}`,
      `Intent: ${state.intent}`,
      `Research mode: ${state.researchMode} — ${researchGuide[state.researchMode]}`,
      "",
      "Style: thorough Socratic interview. Ask one focused question per turn.",
      "Be relentless but collaborative. Challenge vague answers, surface contradictions.",
      "Ask enough follow-up questions to resolve the decision tree.",
      "Walk dependent branches one at a time. Revisit upstream if downstream changes assumptions.",
      "",
      "Checkpoint: maintain a shared-understanding Markdown document.",
      "Update it via grill_update_checkpoint whenever understanding meaningfully changes.",
      "Track coverage checklist and decision branches as they resolve.",
      "",
      `Current phase: ${phaseGuide}`,
      "",
      "Do not assume a default output. The mandatory output-selection phase must explicitly ask.",
    ].join("\n");

    return {
      systemPrompt: `${event.systemPrompt}\n\n${inject}`,
    };
  });

  // Restore state on session start
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === STATE_TYPE) {
        const data = entry.data as GrillState | undefined;
        if (data) {
          state = cloneState(data);
          updateUi(ctx);
        }
        break;
      }
    }
  });
}
