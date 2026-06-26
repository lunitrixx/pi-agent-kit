import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { truncateToWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("ctx", {
    description: "Show token usage and context breakdown",
    handler: async (_args, ctx) => {
      const report: string[] = [];

      // Model and context window
      const usage = ctx.getContextUsage();
      const model = ctx.model;
      report.push(`# /ctx — Context Report`);
      report.push("");
      report.push(`**Model:** ${model?.id ?? "?"}  ·  **Window:** ${model?.contextWindow?.toLocaleString() ?? "?"} tokens`);
      if (usage?.limit) {
        const pct = ((usage.tokens / usage.limit) * 100).toFixed(1);
        report.push(`**Used:** ${usage.tokens.toLocaleString()} / ${usage.limit.toLocaleString()} (${pct}%)`);
      }

      // Messages by role
      report.push("");
      report.push("## Messages by Role");
      const roles: Record<string, { count: number; tokens: number }> = {};
      let totalTokens = 0;
      for (const e of ctx.sessionManager.getBranch()) {
        if (e.type !== "message") continue;
        const role = e.message.role;
        roles[role] ??= { count: 0, tokens: 0 };
        roles[role].count++;
        if (role === "assistant") {
          const m = e.message as AssistantMessage;
          roles[role].tokens += m.usage.input + m.usage.output;
          totalTokens += m.usage.input + m.usage.output;
        }
      }
      for (const [role, stats] of Object.entries(roles).sort((a, b) => b[1].tokens - a[1].tokens)) {
        const pct = totalTokens > 0 ? ` (${((stats.tokens / totalTokens) * 100).toFixed(0)}%)` : "";
        report.push(`- **${role}:** ${stats.count} msgs, ${stats.tokens.toLocaleString()} tokens${pct}`);
      }

      // Top 5 heaviest messages
      report.push("");
      report.push("## Heaviest Messages");
      const msgs: { role: string; tokens: number; preview: string }[] = [];
      for (const e of ctx.sessionManager.getBranch()) {
        if (e.type !== "message" || e.message.role !== "assistant") continue;
        const m = e.message as AssistantMessage;
        const t = m.usage.input + m.usage.output;
        // Extract text preview from any content format
        let preview = "";
        if (typeof m.content === "string") preview = m.content.slice(0, 80).replace(/\n/g, " ");
        else if (Array.isArray(m.content)) {
          preview = m.content
            .filter((p: any) => p?.type === "text" && typeof p.text === "string")
            .map((p: any) => p.text)
            .join(" ")
            .slice(0, 80);
          if (!preview) {
            const tc = m.content.filter((p: any) => p?.type === "toolCall");
            if (tc.length) preview = `[${tc.length} tool calls]`;
          }
        }
        msgs.push({ role: m.role, tokens: t, preview });
      }
      msgs.sort((a, b) => b.tokens - a.tokens);
      for (const m of msgs.slice(0, 5)) {
        report.push(`- **${m.tokens.toLocaleString()}** tokens — "${m.preview}"`);
      }

      // Costs
      report.push("");
      report.push("## Cost");
      let totalCost = 0;
      for (const e of ctx.sessionManager.getBranch()) {
        if (e.type !== "message" || e.message.role !== "assistant") continue;
        totalCost += (e.message as AssistantMessage).usage.cost.total;
      }
      report.push(`Total: $${totalCost.toFixed(4)}`);

      pi.sendMessage({
        customType: "ctx-report",
        content: report.join("\n"),
        display: true,
      });
    },
  });
}
