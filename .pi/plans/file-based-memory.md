# Plan: lntrx-memory v2 – File-based Agent Memory

> Status: draft
> Created: 2026-07-04
> Branch: `feat/file-based-memory`

## Motivation

Das aktuelle `lntrx-memory` nutzt SQLite (`node:sqlite`, Node 24+). Probleme:

- **Abhängigkeit**: Node 24+ Pflicht, `node:sqlite` muss stabil sein
- **Nicht lesbar**: Kein `cat`, kein Editor, kein Git-Diff
- **Nicht reviewbar**: Memory-Änderungen sind unsichtbar
- **Agent schreibt nicht direkt**: Nur via Tool-API (`lntrx_memory_learn`), nicht via Write/Edit
- **Kein Stale-Detection**: Wenn Code gelöscht wird, referenziert Memory ihn weiter

Recherche-Ergebnis: **Claude Code, MemoryWiki und INOSX/agent-memory** setzen alle auf
**Markdown-Dateien mit YAML-Frontmatter**. Kein SQL, kein Vector-DB.

## Ziele

1. **Keine Abhängigkeiten** – reines Node.js (fs, path) + `rg` (optional)
2. **Agent schreibt direkt** – via Write/Edit-Tool, nicht via spezielle Tool-API
3. **LLM-basierte Retrieval** – nicht FTS5, sondern LLM wählt Top-5 relevante Memories
4. **Stale Detection** – source_refs + Alters-Warnings + Agent-Cleanup-Instruktion
5. **Git-diffbar** – jede Memory-Änderung sichtbar
6. **Kein Datenverlust** – Migration von SQLite → Markdown

## Architektur

### Verzeichnisstruktur

```
~/.pi/memory/                          ← global (cross-project)
├── INDEX.md                           ← auto-generiert, first 200 lines geladen
├── preferences.md
└── conventions.md

<project>/.pi/memory/
├── INDEX.md                           ← Hot-Context (top 200 Zeilen)
├── anatomy.md                         ← File-Scan (auto-regeneriert)
├── decisions/
│   └── 2026-07-03-config-struktur.md
├── bugs/
│   └── 2026-07-03-scanner-crash.md
├── facts/
│   └── api-endpoints.md
└── corrections/
    └── 2026-07-03-nicht-npm-sondern-pnpm.md
```

### Dateiformat

Jede Memory-Datei mit YAML-Frontmatter:

```markdown
---
created: 2026-07-03T12:00:00Z
updated: 2026-07-03T14:00:00Z
category: decision
confidence: high
source_refs:
  - extensions/lntrx-memory/src/scanner.ts
  - extensions/lntrx-memory/src/extension.ts
---

# Entscheidung: Scanner nutzt lstatSync

Der Scanner verwendet jetzt `lstatSync` statt `statSync`, um Symlinks
nicht zu folgen. Verhindert Doppelzählung und Stack-Overflow bei Zyklen.

Siehe Bug #3.
```

**Kategorien**: `decision`, `fact`, `convention`, `bug`, `correction`, `preference`

**Pflichtfelder**: `created`, `category`
**Optional**: `updated`, `confidence`, `source_refs`, `labels`

### INDEX.md

Auto-generierter Index (first 200 Zeilen werden bei Session-Start geladen):

```markdown
# Memory Index – pi-agent-kit

> 12 memories – last updated 2026-07-04

## Recent decisions
- [2026-07-03] config-struktur: lntrx-config verwendet Scopes und Keys
- [2026-06-28] architecture: Extension-Struktur mit package.json

## Open bugs
- [2026-07-03] scanner-crash: Stack-Overflow bei Home-Dir-Scan

## Conventions
- [2026-06-15] commit-style: Conventional Commits auf Englisch
```

## Retrieval-Mechanismus

Statt FTS5/Keyword-Suche: **LLM wählt relevante Memories aus**.

```
before_agent_start Hook:
  1. rg/ls scanned alle .md Dateien in .pi/memory/ + ~/.pi/memory/
  2. Parst Frontmatter → Manifest (Dateiname, category, created, source_refs)
  3. Sendet Manifest + User-Query an LLM:
     "Wähle max 5 Memories relevant für: {user_prompt}"
  4. Injected nur die selektierten Memories in System-Prompt
  5. INDEX.md (first 200 lines) wird IMMER geladen
```

**Fallback**: Wenn LLM-Selektion nicht verfügbar (z.B. in sehr kleinen Modellen),
`rg`-basierte Keyword-Suche.

### Stale-Detection

Drei Ebenen, automatisch:

| Ebene | Mechanismus | Wann |
|---|---|---|
| **1. Alters-Warning** | Memory >7 Tage alt → "⚠️ X Tage alt. Verify against current code." | Bei Retrieval |
| **2. Source-Check** | `source_refs` im Frontmatter: existieren die Dateien noch? Nein → Flag "stale" | Bei Retrieval |
| **3. Agent-Cleanup** | Periodischer Prompt: "Review memory, remove stale entries, merge duplicates." | Alle 10 Sessions |

### Memory schreiben

Der Agent schreibt **direkt** via Write/Edit-Tool – kein separater `lntrx_memory_learn`-Call nötig.
Das `lntrx_memory_learn`-Tool bleibt als Convenience-Wrapper (generiert Dateiname, validiert Frontmatter),
ist aber optional.

**Prompt-Instruktion für den Agenten**:
```
After learning something durable, write it to .pi/memory/ as a markdown file
with YAML frontmatter (created, category, source_refs).
Keep INDEX.md under 200 lines. Remove stale entries referencing deleted code.
```

## Tools (Migrationsplan)

| Aktuelles Tool | v2-Äquivalent | Änderung |
|---|---|---|
| `lntrx_memory_search` | `lntrx_memory_search` | LLM-Selektion statt FTS5 |
| `lntrx_memory_learn` | `lntrx_memory_learn` | Convenience-Wrapper, optional |
| `lntrx_memory_forget` | `lntrx_memory_forget` | Löscht Datei(en) |
| `lntrx_memory_scan` | `lntrx_memory_scan` | Schreibt `anatomy.md` |
| `lntrx_memory_bug` | `lntrx_memory_bug` | Schreibt `bugs/*.md` |
| – | `lntrx_memory_index` | **Neu**: Regeneriert INDEX.md |
| – | `lntrx_memory_cleanup` | **Neu**: Stale-Detection-Lauf |

## Phasen

### Phase 1: Core Storage (ersetzt SQLite)

- [ ] `src/store.ts` – Datei-basierte CRUD-Operationen
  - `saveMemory(opts)` → schreibt `.md`-Datei mit Frontmatter
  - `readMemory(path)` → parst Frontmatter + Body
  - `deleteMemory(path)` → löscht Datei
  - `listMemories(dir)` → scanned Verzeichnis, returned Frontmatter-Header
- [ ] `src/paths.ts` – Pfad-Resolution (global vs project)
- [ ] `src/frontmatter.ts` – YAML-Frontmatter-Parser (lightweight, keine Abhängigkeit)
- [ ] `src/anatomy.ts` – `anatomyToMarkdown` schreibt `anatomy.md` statt DB
- [ ] Tests für alle Core-Funktionen

### Phase 2: Intelligent Retrieval

- [ ] `src/retrieval.ts`
  - `buildManifest(memories)` → formatierte Liste für LLM
  - `selectRelevant(manifest, query)` → LLM-Call zur Selektion (max 5)
  - `injectContext(selected)` → System-Prompt-Injection
- [ ] `src/stale.ts`
  - `checkSourceRefs(memory)` → prüft ob source_refs noch existieren
  - `ageWarning(memory)` → generiert Alters-Warnung
- [ ] `src/index.ts` – INDEX.md Generator
- [ ] Integration in `before_agent_start` Hook

### Phase 3: Agent Autonomy

- [ ] Prompt-Instruktionen für selbstständiges Memory-Management
- [ ] `lntrx_memory_cleanup` Tool – manueller Stale-Detection-Lauf
- [ ] Cleanup-Trigger: alle 10 Sessions automatisch vorschlagen
- [ ] `lntrx_memory_index` Tool – INDEX.md neu generieren

### Phase 4: Migration & Cleanup

- [ ] `scripts/migrate-sqlite-to-markdown.ts` – einmalig
- [ ] SQLite-Code entfernen (db.ts, commands.ts DB-Logik)
- [ ] Dokumentation aktualisieren
- [ ] Alte DB-Dateien löschen (`~/.pi/memory.db`)

## Entscheidungen

### Kein Vector-DB, kein FTS5, kein BM25

Das LLM selbst ist der beste Relevance-Selector für <1000 Einträge.
Claude Code macht das exakt so: Manifest → LLM → Top-5 Selektion.

### Kein automatischer Background-Cleanup

Claude Code hat AutoDream (periodischer Hintergrund-Prozess), aber das
erfordert einen Forked-Agent mit eigenem API-Call. Für pi-agent-kit ist
das Overkill. Stattdessen: Agent wird instruiert, selbst aufzuräumen.

### Agent schreibt direkt

Der Agent nutzt Write/Edit-Tools um `.pi/memory/`-Dateien zu schreiben.
`lntrx_memory_learn` bleibt als Convenience-Tool (validiert Frontmatter,
generiert Dateinamen), ist aber nicht der primäre Weg.

### Keine JSONL-Sidecars

MemoryWiki nutzt `retrieval/index.jsonl` als Sidecar. Das erzeugt Sync-Probleme
(Index kann stale werden). Stattdessen: INDEX.md wird bei Bedarf neu generiert,
und LLM-Selektion scanned direkt die `.md`-Dateien.

## Risiken

| Risiko | Mitigation |
|---|---|
| LLM-Selektion kostet Tokens | Nur Manifest (~200 Tokens), nicht alle Dateien |
| Agent vergisst aufzuräumen | Periodischer Prompt + Stale-Warnings |
| Zu viele Memory-Dateien | INDEX.md-Limit (200 Zeilen) als natürliche Grenze |
| Migration verliert Daten | Erst validieren, dann löschen |

## Offene Fragen

1. Soll `lntrx_memory_learn` erhalten bleiben oder reicht direkter Write/Edit?
2. YAML-Parser: Eigenbau (lightweight) oder `js-yaml`-Abhängigkeit?
3. `rg`-Abhängigkeit für Fallback-Suche – akzeptabel?
