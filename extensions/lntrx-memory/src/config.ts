/**
 * lntrx-memory - configuration
 *
 * Reads .pi/memory/config.json for user-configurable settings.
 * Falls back to sensible defaults.
 */
import fs from "node:fs";
import path from "node:path";

export interface MemoryConfig {
  /** Days between automatic anatomy rescans. Default: 14 */
  anatomyRescanDays: number;
}

const DEFAULTS: MemoryConfig = {
  anatomyRescanDays: 14,
};

/**
 * Load config from .pi/memory/config.json.
 * Creates the file with defaults if it doesn't exist.
 */
export function loadConfig(memoryDir: string): MemoryConfig {
  const configPath = path.join(memoryDir, "config.json");

  if (!fs.existsSync(configPath)) {
    // Create with defaults so user can edit
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2) + "\n", "utf-8");
    return { ...DEFAULTS };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return {
      anatomyRescanDays: typeof raw.anatomyRescanDays === "number" ? raw.anatomyRescanDays : DEFAULTS.anatomyRescanDays,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
