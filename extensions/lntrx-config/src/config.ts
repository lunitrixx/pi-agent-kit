import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILE = join(homedir(), ".pi", "agent", "pi-agent-kit.json");

export function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function writeConfig(cfg: Record<string, unknown>): void {
  mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function get(ns: string): unknown {
  return readConfig()[ns];
}

export function set(ns: string, value: unknown): void {
  const cfg = readConfig();
  cfg[ns] = value;
  writeConfig(cfg);
}
