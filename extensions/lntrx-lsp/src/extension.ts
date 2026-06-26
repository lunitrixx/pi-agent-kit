import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn, ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { get, set } from "../../lntrx-config/src/config";

const NS = "lntrx-lsp";

interface LspServer {
  id: string;              // "gopls", "pyright", "my-custom"
  bin: string;             // binary name or path
  args?: string[];         // extra args
  extensions: string[];    // [".ts", ".js"]
  rootMarkers?: string[];  // files that mark project root
}

// Built-in defaults that users can override/extend
const BUILTIN: LspServer[] = [
  { id: "typescript",   bin: "typescript-language-server", args: ["--stdio"], extensions: [".ts",".tsx",".js",".jsx"], rootMarkers: ["package.json","tsconfig.json"] },
  { id: "pyright",      bin: "pyright-langserver", args: ["--stdio"], extensions: [".py",".pyi"], rootMarkers: ["pyproject.toml","setup.py"] },
  { id: "gopls",        bin: "gopls", extensions: [".go"], rootMarkers: ["go.mod"] },
  { id: "rust-analyzer",bin: "rust-analyzer", extensions: [".rs"], rootMarkers: ["Cargo.toml"] },
  { id: "clangd",       bin: "clangd", args: ["--background-index"], extensions: [".c",".h",".cpp",".hpp",".cc",".cxx"], rootMarkers: ["compile_commands.json",".clangd"] },
  { id: "lua",          bin: "lua-language-server", extensions: [".lua"], rootMarkers: [".luarc.json"] },
];

function userServers(): LspServer[] {
  const raw = get(NS);
  return Array.isArray(raw) ? (raw as LspServer[]) : [];
}

function allServers(): LspServer[] {
  const user = userServers();
  if (user.length > 0) return user;  // user config overrides builtins entirely
  return BUILTIN;
}

// Save a new server to user config
function addServer(srv: LspServer) {
  const servers = userServers();
  servers.push(srv);
  set(NS, servers);
}

function findServer(path: string): LspServer | undefined {
  const ext = extname(path);
  return allServers().find((s) => s.extensions.includes(ext));
}

function findRoot(file: string, markers?: string[]): string {
  const parts = file.split("/");
  const search = markers ?? [".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
  for (let i = parts.length - 1; i >= 0; i--) {
    const d = parts.slice(0, i + 1).join("/");
    if (search.some((m) => existsSync(`${d}/${m}`))) return d;
  }
  return process.cwd();
}

function which(bin: string): boolean {
  try { require("child_process").execSync(`which ${bin}`, { stdio: "ignore" }); return true; } catch { return false; }
}

const LANG: Record<string, string> = {
  ".ts":"typescript",".tsx":"typescriptreact",".js":"javascript",".jsx":"javascriptreact",
  ".py":"python",".go":"go",".rs":"rust",".c":"c",".h":"c",".cpp":"cpp",".lua":"lua",
};

// ── LSP Client ──

class LspClient {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, (r: any) => void>();
  private nextId = 1;
  private buf = "";
  private diags: any[] = [];
  private diagResolve: ((d: any[]) => void) | null = null;
  private ready = false;
  private initPromise: Promise<void>;

  constructor(private bin: string, private args: string[], private root: string) {
    this.initPromise = this.start();
  }

  private async start(): Promise<void> {
    const p = spawn(this.bin, this.args, { cwd: this.root, stdio: ["pipe", "pipe", "pipe"] });
    this.proc = p;
    p.stdout.on("data", (d: Buffer) => this.onData(d));
    p.stderr.on("data", () => {});
    p.on("close", () => { this.ready = false; });

    const result = await this.request("initialize", {
      processId: process.pid,
      rootUri: `file://${this.root}`,
      rootPath: this.root,
      capabilities: { textDocument: { diagnostic: {} } },
    });
    if (result) { this.notify("initialized", {}); this.ready = true; }
  }

  private onData(d: Buffer) {
    this.buf += d.toString();
    while (true) {
      const end = this.buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      const m = this.buf.slice(0, end).match(/Content-Length: (\d+)/);
      if (!m) { this.buf = ""; return; }
      const len = parseInt(m[1]);
      if (this.buf.length < end + 4 + len) return;
      const body = this.buf.slice(end + 4, end + 4 + len);
      this.buf = this.buf.slice(end + 4 + len);
      try {
        const msg = JSON.parse(body);
        if (msg.method === "textDocument/publishDiagnostics") {
          this.diags = msg.params?.diagnostics || [];
          if (this.diagResolve) { this.diagResolve(this.diags); this.diagResolve = null; }
        }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          this.pending.get(msg.id)!(msg.result); this.pending.delete(msg.id);
        }
      } catch {}
    }
  }

  private request(method: string, params: any): Promise<any> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.send({ jsonrpc: "2.0", id, method, params });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve(null); } }, 10000);
    });
  }

  private notify(method: string, params: any) { this.send({ jsonrpc: "2.0", method, params }); }
  private send(msg: any) {
    const body = JSON.stringify(msg);
    this.proc?.stdin?.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  async diagnostics(path: string, content: string): Promise<any[]> {
    if (!this.ready) await this.initPromise;
    if (!this.ready) return [];
    this.diags = [];
    this.notify("textDocument/didOpen", {
      textDocument: { uri: `file://${path}`, languageId: LANG[extname(path)] ?? "plaintext", version: 1, text: content },
    });
    return new Promise((resolve) => {
      this.diagResolve = resolve;
      setTimeout(() => { if (this.diagResolve) { this.diagResolve([]); this.diagResolve = null; } }, 3000);
    });
  }

  shutdown() { try { this.proc?.stdin?.end(); this.proc?.kill(); } catch {} }
}

// ── Extension ──

const clients = new Map<string, LspClient>();

function getClient(path: string): LspClient | undefined {
  const srv = findServer(path);
  if (!srv || !which(srv.bin)) return undefined;
  const root = findRoot(path, srv.rootMarkers);
  const key = `${srv.id}::${root}`;
  if (!clients.has(key)) clients.set(key, new LspClient(srv.bin, srv.args ?? [], root));
  return clients.get(key);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("lsp", {
    description: "Manage LSP servers. /lsp add <id> <bin> <.ext> [.ext2...]",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      if (parts[0] === "add" && parts.length >= 4) {
        const srv: LspServer = {
          id: parts[1],
          bin: parts[2],
          extensions: parts.slice(3),
        };
        addServer(srv);
        ctx.ui.notify(`LSP server "${srv.id}" added for ${srv.extensions.join(", ")}.`, "success");
      } else if (parts[0] === "list") {
        const servers = allServers();
        if (servers.length === 0) { ctx.ui.notify("No LSP servers configured.", "info"); return; }
        const lines = servers.map((s) => `- ${s.id}: ${s.bin} [${s.extensions.join(", ")}]`);
        pi.sendMessage({ customType: "lsp-list", content: `**LSP Servers**\n\n${lines.join("\n")}`, display: true });
      } else {
        ctx.ui.notify("Usage: /lsp add <id> <bin> <.ext> [...] | /lsp list", "info");
      }
    },
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "write") return;
    const path = (event.input as any)?.path;
    if (!path || typeof path !== "string") return;
    const content = (event.input as any)?.content;
    if (typeof content !== "string" || !content) return;

    const client = getClient(path);
    if (!client) return;

    try {
      const diags = await client.diagnostics(path, content);
      if (diags.length === 0) {
        return { appendResult: { content: [{ type: "text", text: "\n── LSP ──\n✅ No issues." }] } };
      }
      const lines = diags.map((d: any) => {
        const sev = d.severity === 1 ? "❌" : d.severity === 2 ? "⚠️" : "ℹ️";
        return `${sev} L${d.range.start.line + 1}:${d.range.start.character + 1} — ${d.message}`;
      });
      return { appendResult: { content: [{ type: "text", text: `\n── LSP ──\n${lines.join("\n")}` }] } };
    } catch {
      return { appendResult: { content: [{ type: "text", text: "\n── LSP ──\n⚠️ No diagnostics available." }] } };
    }
  });

  pi.on("session_shutdown", () => {
    for (const c of clients.values()) c.shutdown();
    clients.clear();
  });
}
