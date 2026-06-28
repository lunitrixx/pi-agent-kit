---
name: config-architecture
description: Projekt-spezifische Config-Architektur: lntrx-config Extension, Scopes, Keys, Tests
---

# Config-Architektur

Dieses Projekt nutzt die `lntrx-config` Extension als zentrale Config-Quelle.
**Projekt-Config hat immer Priorität vor Global.**

## Config Extension API

```ts
// Global (~/.pi/agent/pi-agent-kit.json)
get(ns: string): unknown
set(ns: string, value: unknown)     // undefined = löscht Key

// Projekt (<repo>/.pi/pi-agent-kit.json)
getProject(repoPath: string, ns: string): unknown
setProject(repoPath: string, ns: string, value: unknown)  // undefined = löscht Key
```

Datei: `extensions/lntrx-config/src/config.ts`

## Alle Config-Keys

| Key | Global | Projekt | Extension |
|---|---|---|---|
| `lntrx-guard` | ✅ | ✅ | guard (on/off) |
| `lntrx-guard.risks.<id>` | ✅ | ✅ | guard (19 Keys) |
| `lntrx-guard.git-hooks.block-main-commit` | ✅ | ✅ | guard |
| `lntrx-lang` | ✅ | ✅ | lang |
| `project-rules.visible` | ✅ | ✅ | project-rules |
| `lntrx-localmodels` | ✅ | - | localmodels (machine-spezifisch) |
| `lntrx-lsp` | ✅ | - | lsp (machine-spezifisch) |

## Priorität: Projekt > Global > Default

Jede `isEnabled`/`isVisible`/`resolve`-Funktion folgt diesem Muster:

```ts
function check(repoPath: string): boolean {
  const p = getProject(repoPath, KEY);
  if (p !== undefined) return !!p;    // 1. Projekt (spezifischster Scope)
  const g = get(KEY);
  if (g !== undefined) return !!g;    // 2. Global (Fallback)
  return true;                         // 3. Default (immer ON)
}
```

## Guard Risk IDs (19)

```
rm-rf, rm-wildcard, sudo, chmod-777, chown,
force-push, hard-reset, git-clean, push-delete,
dd, docker-prune, docker-rm,
drop-database, drop-table,
pip-uninstall, npm-uninstall, package-publish,
sops-wildcard, pipe-shell
```

## Commands für Config

| Command | Scope |
|---|---|
| `/safety on\|off [--global]` | Guard Master |
| `/safety risk enable\|disable\|list [--global] [<id>]` | Einzelne Risks |
| `/guard-hook enable\|disable\|status [--global]` | Pre-commit Hook |
| `/lang <code> [--global]` | Sprache |
| `/rules-toggle [--global]` | Rules Banner |

Ohne `--global` = Projekt-Scope. Mit `--global` = Global-Scope.

## Tests

```
tests/config.test.ts              — 17 Tests (generische API)
tests/extensions-config.test.ts   — 26 Tests (Extensions-Logik)
```

Ausführen: `npx tsx tests/config.test.ts` / `npx tsx tests/extensions-config.test.ts`

## Änderungen vermeiden

- **Niemals** direkte `readFileSync`/`writeFileSync` auf Config-Dateien in Extensions
- Immer über `lntrx-config` (get/set/getProject/setProject) gehen
- Neue Config-Keys dokumentieren
- Tests in `tests/` erweitern
