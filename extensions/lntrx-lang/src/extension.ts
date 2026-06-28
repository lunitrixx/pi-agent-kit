import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { get, set, getProject, setProject } from "../../lntrx-config/src/config";

const NS = "lntrx-lang";

const LANG_MAP: Record<string, string> = {
  de: "Always respond in German. Your messages and explanations must be in German. Code, identifiers, and technical terms stay in English as they are.",
  en: "Always respond in English. Your messages and explanations must be in English. Code, identifiers, and technical terms stay unchanged.",
  fr: "Always respond in French. Code stays in English.",
  es: "Always respond in Spanish. Code stays in English.",
  ja: "Always respond in Japanese. Code stays in English.",
};

export default function (pi: ExtensionAPI) {
  pi.registerCommand("lang", {
    description: "Set or show the response language. /lang <code> [--global] (de, en, fr, es, ja)",
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+/) ?? [];
      const code = parts[0]?.toLowerCase() ?? "";
      const global = parts.includes("--global") || parts.includes("-g");

      if (!code) {
        const current = get(NS) as string | undefined;
        const projectCode = getProject(ctx.cwd, NS) as string | undefined;
        if (projectCode) {
          ctx.ui.notify(`Language: ${projectCode} (project)${current ? ` — global default: ${current}` : ""}`, "info");
        } else if (current) {
          ctx.ui.notify(`Language: ${current} (global)`, "info");
        } else {
          ctx.ui.notify("No language set. Use /lang <code> [--global] (de, en, fr, es, ja)", "info");
        }
        return;
      }

      if (!LANG_MAP[code]) {
        ctx.ui.notify(`Unknown language "${code}". Available: ${Object.keys(LANG_MAP).join(", ")}`, "warning");
        return;
      }

      if (global) {
        set(NS, code);
      } else {
        setProject(ctx.cwd, NS, code);
      }
      const scope = global ? "globally" : "for this project";
      ctx.ui.notify(`Language set to ${code} ${scope}.`, "success");
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const projectCode = getProject(ctx.cwd, NS) as string | undefined;
    const code = projectCode ?? get(NS) as string | undefined;
    if (!code || !LANG_MAP[code]) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${LANG_MAP[code]}`,
    };
  });
}
