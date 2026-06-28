/**
 * lntrx-memory - database layer
 *
 * SQLite + FTS5 backend, schema, paths, types.
 * Requires Node 24+ (stable node:sqlite).
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// SQLite loader
// ---------------------------------------------------------------------------

export type SqliteDB = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...params: unknown[]) => { lastInsertRowid: number | bigint; changes: number };
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  close: () => void;
};

export let DatabaseSync: { new (path: string): SqliteDB } | null = null;
export let sqliteLoadError: string | null = null;

try {
  const suppressExperimental = (w: { name: string }) => {
    if (w.name === "ExperimentalWarning") return;
  };
  process.on("warning", suppressExperimental);
  ({ DatabaseSync } = require("node:sqlite") as { DatabaseSync: { new (p: string): SqliteDB } });
  process.off("warning", suppressExperimental);
} catch (err) {
  sqliteLoadError =
    (err as Error).message +
    " - lntrx-memory needs Node 24+ (stable node:sqlite).";
}

// ---------------------------------------------------------------------------
// Paths & project detection
// ---------------------------------------------------------------------------

export function defaultDbPath(): string {
  if (process.env.LNTRX_MEMORY_DB) return process.env.LNTRX_MEMORY_DB;
  return path.join(os.homedir(), ".pi", "memory.db");
}

export function detectProject(cwd: string): string {
  if (process.env.LNTRX_MEMORY_PROJECT) return process.env.LNTRX_MEMORY_PROJECT;
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (root) return root;
  } catch {
    /* not a git repo */
  }
  return cwd;
}

export const GLOBAL_SCOPE = "*";

// ---------------------------------------------------------------------------
// Database schema
// ---------------------------------------------------------------------------

export function openDb(dbPath: string): SqliteDB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync!(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS entries (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      created   INTEGER NOT NULL DEFAULT (unixepoch()),
      scope     TEXT    NOT NULL DEFAULT 'project'
                CHECK(scope IN ('project','global')),
      project   TEXT    NOT NULL DEFAULT '',
      category  TEXT    NOT NULL DEFAULT 'note'
                CHECK(category IN ('note','decision','convention','preference','bug','anatomy','correction')),
      headline  TEXT    NOT NULL,
      detail    TEXT    NOT NULL DEFAULT '',
      labels    TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_entries_project ON entries(project);
    CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);

    CREATE VIRTUAL TABLE IF NOT EXISTS entries_idx USING fts5(
      headline, detail, labels,
      content='entries', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS tr_entries_ins AFTER INSERT ON entries BEGIN
      INSERT INTO entries_idx(rowid, headline, detail, labels)
      VALUES (new.id, new.headline, new.detail, new.labels);
    END;
    CREATE TRIGGER IF NOT EXISTS tr_entries_del AFTER DELETE ON entries BEGIN
      INSERT INTO entries_idx(entries_idx, rowid, headline, detail, labels)
      VALUES ('delete', old.id, old.headline, old.detail, old.labels);
    END;
    CREATE TRIGGER IF NOT EXISTS tr_entries_upd AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_idx(entries_idx, rowid, headline, detail, labels)
      VALUES ('delete', old.id, old.headline, old.detail, old.labels);
      INSERT INTO entries_idx(rowid, headline, detail, labels)
      VALUES (new.id, new.headline, new.detail, new.labels);
    END;

    CREATE TABLE IF NOT EXISTS bugs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      created   INTEGER NOT NULL DEFAULT (unixepoch()),
      project   TEXT    NOT NULL,
      symptom   TEXT    NOT NULL,
      solution  TEXT    NOT NULL DEFAULT '',
      state     TEXT    NOT NULL DEFAULT 'open'
                CHECK(state IN ('open','fixed','wontfix','duplicate'))
    );
    CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project);
    CREATE INDEX IF NOT EXISTS idx_bugs_state ON bugs(state);
  `);
  return db;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Entry = {
  id: number;
  created: number;
  scope: "project" | "global";
  project: string;
  category: string;
  headline: string;
  detail: string;
  labels: string;
};

export type Bug = {
  id: number;
  created: number;
  project: string;
  symptom: string;
  solution: string;
  state: "open" | "fixed" | "wontfix" | "duplicate";
};

export type TextBlock = { type?: string; text?: string };
export type AssistantMessage = { role?: string; content?: unknown };
