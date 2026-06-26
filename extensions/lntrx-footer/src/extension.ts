import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { truncateToWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  let thinking = "high", lastTps: number | null = null, msgStart = 0, sessionStart = Date.now();

  pi.on("thinking_level_select", (e) => { thinking = e.level; });
  pi.on("message_start", (e) => { if (e.message.role === "assistant") msgStart = Date.now(); });
  pi.on("message_end", (e) => {
    if (e.message.role === "assistant") {
      const m = e.message as AssistantMessage;
      const d = (Date.now() - msgStart) / 1000;
      if (d > 0.5 && m.usage.output > 0) lastTps = Math.round(m.usage.output / d);
      msgStart = 0;
    }
  });

  pi.on("session_start", (_e, ctx) => {
    sessionStart = Date.now();
    ctx.ui.setFooter((tui, theme, footer) => {
      footer.onBranchChange(() => tui.requestRender());
      return {
        dispose() {}, invalidate() {},
        render(width: number): string[] {
          let inp = 0, out = 0, cost = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              inp += m.usage.input; out += m.usage.output; cost += m.usage.cost.total;
            }
          }

          const K = (n: number) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}k` : `${n}`;
          const S = ` ${theme.fg("dim", "│")} `;
          const p: string[] = [];

          p.push(theme.fg("accent", theme.bold(ctx.model?.id ?? "?")));

          const prov = ctx.model?.provider ?? "";
          if (prov) p.push(theme.fg("muted", `@${prov}`));

          const git = footer.getGitBranch();
          if (git) p.push(theme.fg("success", ` ${git}`));

          const dot: Record<string, string> = {
            off: "thinkingOff", minimal: "thinkingMinimal", low: "thinkingLow",
            medium: "thinkingMedium", high: "thinkingHigh", "extra-high": "thinkingXhigh",
          };
          p.push(theme.fg(dot[thinking] ?? "accent", `● ${thinking}`));

          p.push(`${theme.fg("success", `↑${K(inp)}`)} ${theme.fg("error", `↓${K(out)}`)}`);

          if (lastTps) p.push(theme.fg("muted", `${lastTps} t/s`));

          if (cost > 0) p.push(theme.fg("warning", `$${cost.toFixed(3)}`));

          const min = Math.floor((Date.now() - sessionStart) / 60000);
          if (min > 0) p.push(theme.fg("dim", `⏱ ${min}m`));

          const ctxU = ctx.getContextUsage();
          if (ctxU?.contextWindow && ctxU.tokens != null) {
            const pct = ctxU.tokens / ctxU.contextWindow;
            const bw = 10, filled = Math.round(pct * bw);
            const bar = "█".repeat(filled) + "░".repeat(bw - filled);
            const color = pct > 0.85 ? "error" : pct > 0.6 ? "warning" : "success";
            p.push(`${theme.fg(color, bar)} ${theme.fg("dim", `${(pct*100).toFixed(0)}%`)}`);
          }

          return [truncateToWidth(p.join(S), width)];
        },
      };
    });
  });
}
