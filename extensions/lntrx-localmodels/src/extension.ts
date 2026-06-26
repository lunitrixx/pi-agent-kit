import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text, Spacer } from "@earendil-works/pi-tui";
import { get, set } from "../../lntrx-config/src/config";

const NS = "lntrx-localmodels";

interface Endpoint {
  name: string;
  url: string;
  key?: string;
  status: "checking" | "up" | "down";
}

function eps(): Endpoint[] {
  const raw = get(NS);
  return Array.isArray(raw) ? (raw as Endpoint[]) : [];
}
function save(ep: Endpoint[]) { set(NS, ep); }
function provider(ep: Endpoint) { return `local-${ep.name.toLowerCase().replace(/\s+/g, "-")}`; }
function urlNorm(u: string) { return u.trim().replace(/\/+$/, ""); }

async function check(url: string, key?: string): Promise<boolean> {
  try {
    const h: Record<string, string> = { Accept: "application/json" };
    if (key) h.Authorization = `Bearer ${key}`;
    const r = await fetch(`${url}/models`, { headers: h, signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

async function models(url: string, key?: string): Promise<string[]> {
  try {
    const h: Record<string, string> = { Accept: "application/json" };
    if (key) h.Authorization = `Bearer ${key}`;
    const r = await fetch(`${url}/models`, { headers: h, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = await r.json() as { data?: Array<{ id: string }> };
    return (j.data ?? []).map((m) => m.id);
  } catch { return []; }
}

function register(pi: ExtensionAPI, ep: Endpoint, ids: string[]) {
  if (ids.length === 0) return;
  pi.registerProvider(provider(ep), {
    name: ep.name, baseUrl: ep.url, apiKey: ep.key || "sk-no-key", api: "openai-completions",
    models: ids.map((id) => ({ id, name: id, reasoning: false, input: ["text"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 })),
  });
}

async function showTui(pi: ExtensionAPI, ctx: any, list: Endpoint[]): Promise<void> {
  const items = list.map((ep) => ({
    value: ep.name,
    label: `${ep.status === "up" ? "🟢" : ep.status === "down" ? "🔴" : "🟡"} ${ep.name}`,
    description: ep.url,
  }));
  items.push({ value: "➕ Add", label: "➕  Add endpoint", description: "Connect a new local LLM" });
  if (list.length > 0) items.push({ value: "🔄 Refresh", label: "🔄  Refresh all", description: "Re-check all endpoints" });

  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const c = new Container();
    c.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    c.addChild(new Text(theme.fg("accent", theme.bold(" Local Models "))));
    const sl = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
    });
    sl.onSelect = (item) => done(item.value as any);
    sl.onCancel = () => done();
    c.addChild(sl);
    c.addChild(new Spacer(1));
    c.addChild(new Text(theme.fg("dim", "  ↑↓ navigate · enter select · esc back · d delete selected")));
    c.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    return {
      render: (w) => c.render(w),
      invalidate: () => c.invalidate(),
      handleInput: (data) => {
        if (data === "d") { done("DELETE_SELECTED" as any); return; }
        sl.handleInput?.(data); tui.requestRender();
      },
    };
  });
}

export default async function (pi: ExtensionAPI) {
  // Register known endpoints at startup
  for (const ep of eps()) {
    const m = await models(ep.url, ep.key);
    ep.status = m.length > 0 ? "up" : "down";
    if (m.length > 0) register(pi, ep, m);
    save(eps());
  }

  pi.registerCommand("local-models", {
    description: "Manage local LLM endpoints with TUI",
    handler: async (_args, ctx) => {
      let list = eps();
      while (true) {
        const pick = await showTui(pi, ctx, list) as string | undefined;
        if (!pick) break;
        if (pick === "➕ Add") {
          const name = await ctx.ui.input("Name (e.g. Ollama):");
          if (!name) continue;
          let url = await ctx.ui.input("URL with /v1:");
          if (!url) continue;
          url = urlNorm(url);
          const useKey = await ctx.ui.confirm("API Key?", "Need an API key?");
          let key: string | undefined;
          if (useKey) { const k = await ctx.ui.input("Key:"); if (k) key = k; }
          ctx.ui.notify("Checking...", "info");
          const up = await check(url, key);
          const m = up ? await models(url, key) : [];
          list = eps();
          list.push({ name, url, key, status: up ? "up" : "down" });
          save(list);
          if (up && m.length > 0) {
            register(pi, list[list.length - 1], m);
            ctx.ui.notify(`${name} ready — ${m.length} models.`, "success");
          } else {
            ctx.ui.notify(`${name} saved (${up ? "no models" : "unreachable"}).`, "warning");
          }
        } else if (pick === "🔄 Refresh") {
          for (const ep of list) {
            ep.status = "checking";
            const up = await check(ep.url, ep.key);
            ep.status = up ? "up" : "down";
            if (up) { const m = await models(ep.url, ep.key); register(pi, ep, m); }
            else pi.unregisterProvider(provider(ep));
          }
          save(list);
          ctx.ui.notify("All endpoints refreshed.", "success");
        } else if (pick === "DELETE_SELECTED") {
          ctx.ui.notify("Use 'd' to delete is NYI", "warning"); // todo
        } else {
          // Pick a model from this endpoint
          const ep = list.find((e) => e.name === pick);
          if (!ep || ep.status !== "up") { ctx.ui.notify(`${pick} is offline.`, "error"); continue; }
          const m = await models(ep.url, ep.key);
          if (m.length === 0) { ctx.ui.notify("No models found.", "error"); continue; }
          const chosen = await ctx.ui.select(`Pick a model on ${ep.name}:`, m);
          if (!chosen) continue;
          register(pi, ep, m);
          const mdl = ctx.modelRegistry.find(provider(ep), chosen);
          if (mdl) {
            await pi.setModel(mdl);
            ctx.ui.notify(`Switched to ${provider(ep)}/${chosen}`, "success");
          }
        }
      }
    },
  });
}
