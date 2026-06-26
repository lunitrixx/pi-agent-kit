import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { get, set } from "../../lntrx-config/src/config";

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
    description: "Set or show the response language (de, en, fr, es, ja)",
    handler: async (args, ctx) => {
      const code = args?.trim().toLowerCase() ?? "";

      if (!code) {
        const current = get(NS) as string | undefined;
        if (current) {
          ctx.ui.notify(`Current language: ${current}`, "info");
        } else {
          ctx.ui.notify("No language set. Use /lang <code> (de, en, fr, es, ja)", "info");
        }
        return;
      }

      if (!LANG_MAP[code]) {
        ctx.ui.notify(`Unknown language "${code}". Available: ${Object.keys(LANG_MAP).join(", ")}`, "warning");
        return;
      }

      set(NS, code);
      ctx.ui.notify(`Language set to: ${code}`, "success");
    },
  });

  pi.on("before_agent_start", async (event) => {
    const code = get(NS) as string | undefined;
    if (!code || !LANG_MAP[code]) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${LANG_MAP[code]}`,
    };
  });
}
