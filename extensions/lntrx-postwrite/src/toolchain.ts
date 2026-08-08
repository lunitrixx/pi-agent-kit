/**
 * lntrx-postwrite - shared toolchain (findRoot, which-cache, formatters, LSP)
 *
 * Consolidated from lntrx-fmt and lntrx-lsp. Single module for root-finding,
 * binary detection (session-cached), language/formatter tables, and LSP types.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname } from "node:path";

// ---------------------------------------------------------------------------
// Root discovery
// ---------------------------------------------------------------------------

const ROOT_MARKERS = [".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];

export function findRoot(file: string): string {
  const dirs = file.split("/");
  for (let i = dirs.length - 1; i >= 0; i--) {
    const d = dirs.slice(0, i + 1).join("/");
    if (ROOT_MARKERS.some((m) => existsSync(`${d}/${m}`))) return d;
  }
  return process.cwd();
}

// ---------------------------------------------------------------------------
// which() cache (per-session, avoids subprocess per write)
// ---------------------------------------------------------------------------

const whichCache = new Map<string, boolean>();

export function which(bin: string): boolean {
  if (whichCache.has(bin)) return whichCache.get(bin)!;
  try {
    execSync(`which ${bin}`, { stdio: "ignore" });
    whichCache.set(bin, true);
    return true;
  } catch {
    whichCache.set(bin, false);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Formatter definitions
// ---------------------------------------------------------------------------

export interface Formatter {
  bin: string;
  args: string[];
  extensions: string[];
  detect: string[]; // files that indicate this formatter is configured
}

export const FORMATTERS: Formatter[] = [
  { bin: "biome", args: ["format", "--write"], extensions: [".ts",".tsx",".js",".jsx",".json",".jsonc"], detect: ["biome.json","biome.jsonc"] },
  { bin: "prettier", args: ["--write"], extensions: [".ts",".tsx",".js",".jsx",".json",".md",".css",".html",".yaml",".yml"], detect: [".prettierrc",".prettierrc.json","prettier.config.js"] },
  { bin: "ruff", args: ["format"], extensions: [".py",".pyi"], detect: ["pyproject.toml","ruff.toml"] },
  { bin: "gofmt", args: ["-w"], extensions: [".go"], detect: ["go.mod"] },
  { bin: "rustfmt", args: [], extensions: [".rs"], detect: ["Cargo.toml"] },
  { bin: "clang-format", args: ["-i"], extensions: [".c",".h",".cpp",".hpp",".cc",".cxx"], detect: [".clang-format"] },
];

export function findFormatter(path: string, root: string): Formatter | undefined {
  const ext = extname(path).toLowerCase();
  for (const fmt of FORMATTERS) {
    if (!fmt.extensions.includes(ext)) continue;
    for (const d of fmt.detect) {
      if (existsSync(`${root}/${d}`)) return fmt;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// LSP definitions + language map
// ---------------------------------------------------------------------------

export const LANG: Record<string, string> = {
  ".ts":"typescript",".tsx":"typescriptreact",".js":"javascript",".jsx":"javascriptreact",
  ".py":"python",".go":"go",".rs":"rust",".c":"c",".h":"c",".cpp":"cpp",".lua":"lua",
};

export interface LspServer {
  id: string;
  bin: string;
  args?: string[];
  extensions: string[];
  rootMarkers?: string[];
}

export const BUILTIN_LSP: LspServer[] = [
  { id: "typescript",   bin: "typescript-language-server", args: ["--stdio"], extensions: [".ts",".tsx",".js",".jsx"], rootMarkers: ["package.json","tsconfig.json"] },
  { id: "pyright",      bin: "pyright-langserver", args: ["--stdio"], extensions: [".py",".pyi"], rootMarkers: ["pyproject.toml","setup.py"] },
  { id: "gopls",        bin: "gopls", extensions: [".go"], rootMarkers: ["go.mod"] },
  { id: "rust-analyzer",bin: "rust-analyzer", extensions: [".rs"], rootMarkers: ["Cargo.toml"] },
  { id: "clangd",       bin: "clangd", args: ["--background-index"], extensions: [".c",".h",".cpp",".hpp",".cc",".cxx"], rootMarkers: ["compile_commands.json",".clangd"] },
  { id: "lua",          bin: "lua-language-server", extensions: [".lua"], rootMarkers: [".luarc.json"] },
];

export function findServer(path: string, servers: LspServer[]): LspServer | undefined {
  const ext = extname(path);
  return servers.find((s) => s.extensions.includes(ext));
}