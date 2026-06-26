import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const WS = join(homedir(), ".pi", "web-search.json");

const DEFAULTS: Record<string, unknown> = {
  summaryModel: "openrouter/google/gemma-4-26b-a4b-it",
  workflow: "auto-summary",
};

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    mkdirSync(join(homedir(), ".pi"), { recursive: true });

    let cfg: Record<string, unknown> = {};
    if (existsSync(WS)) {
      try { cfg = JSON.parse(readFileSync(WS, "utf-8")); } catch { /* empty */ }
    }

    let changed = false;
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (!(k in cfg)) { cfg[k] = v; changed = true; }
    }

    if (changed) writeFileSync(WS, JSON.stringify(cfg, null, 2) + "\n");
  });
}
