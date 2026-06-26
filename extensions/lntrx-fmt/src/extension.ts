import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { extname, dirname } from "node:path";
import { existsSync } from "node:fs";

interface Formatter {
  bin: string;
  args: string[];
  extensions: string[];
  detect: string[]; // files that indicate this formatter is configured
}

const FORMATTERS: Formatter[] = [
  { bin: "biome", args: ["format", "--write"], extensions: [".ts",".tsx",".js",".jsx",".json",".jsonc"], detect: ["biome.json","biome.jsonc"] },
  { bin: "prettier", args: ["--write"], extensions: [".ts",".tsx",".js",".jsx",".json",".md",".css",".html",".yaml",".yml"], detect: [".prettierrc",".prettierrc.json","prettier.config.js"] },
  { bin: "ruff", args: ["format"], extensions: [".py",".pyi"], detect: ["pyproject.toml","ruff.toml"] },
  { bin: "gofmt", args: ["-w"], extensions: [".go"], detect: ["go.mod"] },
  { bin: "rustfmt", args: [], extensions: [".rs"], detect: ["Cargo.toml"] },
  { bin: "clang-format", args: ["-i"], extensions: [".c",".h",".cpp",".hpp",".cc",".cxx"], detect: [".clang-format"] },
];

function findFormatter(path: string, cwd: string): Formatter | undefined {
  const ext = extname(path).toLowerCase();
  for (const fmt of FORMATTERS) {
    if (!fmt.extensions.includes(ext)) continue;
    // Check if configured in project
    for (const d of fmt.detect) {
      if (existsSync(`${cwd}/${d}`)) return fmt;
    }
  }
  return undefined;
}

function which(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: "ignore" }); return true; } catch { return false; }
}

function findRoot(file: string): string {
  const dirs = file.split("/");
  for (let i = dirs.length - 1; i >= 0; i--) {
    const d = dirs.slice(0, i + 1).join("/");
    if (existsSync(`${d}/.git`) || existsSync(`${d}/package.json`) || existsSync(`${d}/pyproject.toml`) || existsSync(`${d}/go.mod`) || existsSync(`${d}/Cargo.toml`)) {
      return d;
    }
  }
  return dirname(file);
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const path = (event.input as any)?.path || (event.input as any)?.file_path;
    if (!path || typeof path !== "string") return;

    const root = findRoot(path);
    const fmt = findFormatter(path, root);
    if (!fmt || !which(fmt.bin)) return;

    try {
      execSync(`${fmt.bin} ${fmt.args.join(" ")} "${path}"`, { cwd: root, stdio: "pipe", timeout: 10000 });
      return {
        appendResult: { content: [{ type: "text", text: `\n✓ formatted with ${fmt.bin}` }] },
      };
    } catch {
      // Format failed, probably syntax error - don't block
    }
  });
}
