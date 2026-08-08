import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GLOBAL_FILE = join(homedir(), ".pi", "agent", "pi-agent-kit.json");

// ---- Global config (~/.pi/agent/pi-agent-kit.json) ----

function readGlobal(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(GLOBAL_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeGlobal(cfg: Record<string, unknown>): void {
  mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
  writeFileSync(GLOBAL_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

export function get(ns: string): unknown {
  return readGlobal()[ns];
}

export function set(ns: string, value: unknown): void {
  const cfg = readGlobal();
  if (value === undefined) {
    delete cfg[ns];
  } else {
    cfg[ns] = value;
  }
  writeGlobal(cfg);
}

// ---- Project config (<repo>/.pi/pi-agent-kit.json) ----

function projectFile(repoPath: string): string {
  return join(repoPath, ".pi", "pi-agent-kit.json");
}

function readProject(repoPath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(projectFile(repoPath), "utf-8"));
  } catch {
    return {};
  }
}

function writeProject(repoPath: string, cfg: Record<string, unknown>): void {
  mkdirSync(join(repoPath, ".pi"), { recursive: true });
  writeFileSync(projectFile(repoPath), JSON.stringify(cfg, null, 2) + "\n");
}

export function getProject(repoPath: string, ns: string): unknown {
  return readProject(repoPath)[ns];
}

export function setProject(repoPath: string, ns: string, value: unknown): void {
  const cfg = readProject(repoPath);
  if (value === undefined) {
    delete cfg[ns];
  } else {
    cfg[ns] = value;
  }
  writeProject(repoPath, cfg);
}
