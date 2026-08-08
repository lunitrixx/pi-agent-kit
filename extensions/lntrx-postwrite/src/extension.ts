/**
 * lntrx-postwrite - auto-format + LSP diagnostics after write/edit
 *
 * Merges lntrx-fmt and lntrx-lsp into one extension with correct ordering:
 *  1. Format the file (if formatter available)
 *  2. Diagnose the *formatted* file content with LSP (if server available)
 *
 * Hooks on both write and edit (previously lsp only watched write).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn, ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { execSync } from "node:child_process";
import { get, set } from "../../../lib/config";
import {
  findRoot, which, FORMATTERS, findFormatter,
  LANG, BUILTIN_LSP, findServer, LspServer,
} from "./toolchain";

const NS = "lntrx-postwrite";

// ---------------------------------------------------------------------------
// Config: user-defined LSP servers override builtins
// ---------------------------------------------------------------------------

function userServers(): LspServer[] {
  const raw = get(`${NS}.lsp-servers`);
  return Array.isArray(raw) ? (raw as LspServer[]) : [];
}

function allServers(): LspServer[] {
  const user = userServers();
  if (user.length > 0) return user;
  return BUILTIN_LSP;
}

function addServer(srv: LspServer) {
  const servers = userServers();
  servers.push(srv);
  set(`${NS}.lsp-servers`, servers);
}

// ---------------------------------------------------------------------------
// LSP Client (per server+root, lazy-spawned via getClient)
// ---------------------------------------------------------------------------

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

  /**
   * Send a file for diagnostics. `content` should be the actual file content
   * on disk (post-formatting) so line numbers match reality.
   */
  async diagnostics(path: string, content: string): Promise<any[]> {
    if (!this.ready) await this.initPromise;
    if (!this.ready) return [];
    this.diags = [];
    this.notify("textDocument/didOpen", {
      textDocument: {
        uri: `file://${path}`,
        languageId: LANG[extname(path)] ?? "plaintext",
        version: 1,
        text: content,
      },
    });
    return new Promise((resolve) => {
      this.diagResolve = resolve;
      setTimeout(() => { if (this.diagResolve) { this.diagResolve([]); this.diagResolve = null; } }, 3000);
    });
  }

  shutdown() { try { this.proc?.stdin?.end(); this.proc?.kill(); } catch {} }
}

// ---------------------------------------------------------------------------
// Client cache (per server+root)
// ---------------------------------------------------------------------------

const clients = new Map<string, LspClient>();

function getClient(path: string): LspClient | undefined {
  const srv = findServer(path, allServers());
  if (!srv || !which(srv.bin)) return undefined;
  const root = srv.rootMarkers ? findRootIn(path, srv.rootMarkers) : findRoot(path);
  const key = `${srv.id}::${root}`;
  if (!clients.has(key)) clients.set(key, new LspClient(srv.bin, srv.args ?? [], root));
  return clients.get(key);
}

function findRootIn(file: string, markers: string[]): string {
  const parts = file.split("/");
  for (let i = parts.length - 1; i >= 0; i--) {
    const d = parts.slice(0, i + 1).join("/");
    if (markers.some((m) => existsSync(`${d}/${m}`))) return d;
  }
  return process.cwd();
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // ---- /postwrite command (LSP server management) ----
  pi.registerCommand("postwrite", {
    description: "Manage auto-format + LSP. /postwrite lsp add|list",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      if (parts[0] === "lsp" && parts[1] === "add" && parts.length >= 5) {
        const srv: LspServer = {
          id: parts[2],
          bin: parts[3],
          extensions: parts.slice(4),
        };
        addServer(srv);
        ctx.ui.notify(`LSP server "${srv.id}" added for ${srv.extensions.join(", ")}.`, "success");
      } else if (parts[0] === "lsp" && parts[1] === "list") {
        const servers = allServers();
        if (servers.length === 0) { ctx.ui.notify("No LSP servers configured.", "info"); return; }
        const lines = servers.map((s) => `- ${s.id}: ${s.bin} [${s.extensions.join(", ")}]`);
        pi.sendMessage({ customType: "postwrite-lsp-list", content: `**LSP Servers**\n\n${lines.join("\n")}`, display: true });
      } else {
        ctx.ui.notify("Usage: /postwrite lsp add <id> <bin> <.ext> [...] | /postwrite lsp list", "info");
      }
    },
  });

  // ---- main hook: format → diagnose (write + edit) ----
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const path = (event.input as any)?.path || (event.input as any)?.file_path;
    if (!path || typeof path !== "string") return;

    const root = findRoot(path);
    const fmt = findFormatter(path, root);

    // Step 1: Format the file on disk (if formatter configured + available)
    if (fmt && which(fmt.bin)) {
      try {
        execSync(`${fmt.bin} ${fmt.args.join(" ")} "${path}"`, {
          cwd: root, stdio: "pipe", timeout: 10000,
        });
      } catch {
        // Format failed, probably syntax error - continue to LSP anyway
      }
    }

    // Step 2: Read the (potentially formatted) file from disk so LSP
    //         line numbers match reality
    let fileContent = "";
    try { fileContent = readFileSync(path, "utf-8"); } catch { return; }

    // Step 3: LSP diagnostics on the actual file content
    const client = getClient(path);
    if (!client) return;

    try {
      const diags = await client.diagnostics(path, fileContent);

      const fmtNote = fmt ? ` + ${fmt.bin}` : "";
      if (diags.length === 0) {
        return {
          appendResult: { content: [{ type: "text", text: `\n✓ postwrite${fmtNote}\n── LSP ──\n✅ No issues.` }] },
        };
      }
      const lines = diags.map((d: any) => {
        const sev = d.severity === 1 ? "❌" : d.severity === 2 ? "⚠️" : "ℹ️";
        return `${sev} L${d.range.start.line + 1}:${d.range.start.character + 1} — ${d.message}`;
      });
      return {
        appendResult: { content: [{ type: "text", text: `\n✓ postwrite${fmtNote}\n── LSP ──\n${lines.join("\n")}` }] },
      };
    } catch {
      return {
        appendResult: { content: [{ type: "text", text: `\n✓ postwrite${fmtNote}\n── LSP ──\n⚠️ No diagnostics available.` }] },
      };
    }
  });

  // ---- cleanup ----
  pi.on("session_shutdown", () => {
    for (const c of clients.values()) c.shutdown();
    clients.clear();
  });
}