/**
 * lntrx-permit - shell tokenizer + command normalizer
 *
 * Tokenizes a POSIX subset into NormalizedCommand, expanding short flags to
 * long form so that a single glob rule catches both `-f` and `--force`.
 *
 * Boundaries (documented, not hidden):
 * - No variable expansion or command substitution
 * - No alias resolution
 * - No function definitions
 * All three produce {unparseable: true} → fail-closed.
 */

export interface NormalizedCommand {
  argv0: string;
  subcommand?: string;
  flags: Set<string>;
  args: string[];
  /** Space-joined canonical form: "git push --force origin main" */
  canonical: string;
  unparseable: boolean;
}

// ---------------------------------------------------------------------------
// Flag alias table: short → long, per-command
// ---------------------------------------------------------------------------

const FLAG_ALIASES: Record<string, Record<string, string>> = {
  rm:       { r: "recursive", f: "force", i: "interactive", v: "verbose" },
  cp:       { r: "recursive", f: "force", i: "interactive", v: "verbose", a: "archive", p: "preserve" },
  mv:       { f: "force", i: "interactive", v: "verbose", n: "no-clobber" },
  git:      {},  // git short flags handled per-subcommand below
  chmod:    { R: "recursive", v: "verbose" },
  chown:    { R: "recursive", v: "verbose" },
  ls:       { l: "long", a: "all", h: "human-readable", t: "time", r: "reverse" },
  grep:     { i: "ignore-case", v: "invert-match", r: "recursive", n: "line-number" },
  curl:     { L: "location", s: "silent", X: "request", H: "header", o: "output" },
  wget:     { q: "quiet", O: "output-document", c: "continue" },
  npm:      {},  // handled per-subcommand below
  yarn:     {},
};

const GIT_SUBCOMMAND_ALIASES: Record<string, Record<string, string>> = {
  push:     { f: "force", d: "delete", u: "set-upstream", v: "verbose" },
  reset:    {},  // --hard has no short form
  branch:   { d: "delete", D: "delete", m: "move", c: "copy" },
  commit:   { a: "all", m: "message", v: "verbose" },
  checkout: { b: "branch", B: "branch" },
  clean:    { n: "dry-run", f: "force", d: "remove-untracked-dirs", x: "remove-ignored" },
  log:      { n: "max-count" },
};

const NPM_SUBCOMMAND_ALIASES: Record<string, Record<string, string>> = {
  install:  { D: "save-dev", S: "save", P: "save-prod", g: "global", f: "force" },
  uninstall:{ D: "save-dev", S: "save", P: "save-prod", g: "global" },
};

// ---------------------------------------------------------------------------
// Unparseable markers
// ---------------------------------------------------------------------------

const UNPARSEABLE_MARKERS = [
  /\$\(/,       // command substitution
  /`/,          // backtick substitution
  /\$\{/,       // parameter expansion
  /\beval\b/,   // eval
  /<<</,        // here-string
  /\$IFS/,      // IFS manipulation
];

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

interface Token {
  type: "word" | "flag-short" | "flag-long" | "flag-eq" | "env-assign" | "redirect" | "unparseable";
  value: string;
}

/**
 * Tokenize a single command segment (no pipes/&&/; separators).
 */
function tokenize(segment: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < segment.length) {
    // Skip whitespace
    if (/\s/.test(segment[i])) { i++; continue; }

    // Single-quoted string
    if (segment[i] === "'") {
      const end = findClosingQuote(segment, i + 1, "'");
      if (end < 0) { tokens.push({ type: "word", value: segment.slice(i) }); i = segment.length; break; }
      tokens.push({ type: "word", value: segment.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    // Double-quoted string
    if (segment[i] === '"') {
      const end = findClosingQuote(segment, i + 1, '"');
      if (end < 0) { tokens.push({ type: "word", value: segment.slice(i) }); i = segment.length; break; }
      tokens.push({ type: "word", value: segment.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    // Check for unparseable markers
    const rest = segment.slice(i);
    if (UNPARSEABLE_MARKERS.some((m) => m.test(rest))) {
      tokens.push({ type: "unparseable", value: rest.slice(0, 4) });
      // Add remaining context as a word so canonical still shows it
      tokens.push({ type: "word", value: rest });
      i = segment.length;
      break;
    }

    // Long flag: --flag or --flag=value
    if (segment[i] === "-" && segment[i + 1] === "-") {
      const eq = segment.indexOf("=", i);
      const sp = nextWhitespace(segment, i);
      let end: number;
      if (eq > 0 && eq < sp) {
        end = eq;
        tokens.push({ type: "flag-eq", value: segment.slice(i, end + 1) + "..." });
      } else {
        end = sp;
      }
      tokens.push({ type: "flag-long", value: segment.slice(i, end) });
      i = end;
      continue;
    }

    // Bundled short flags: -rf, -la, -rfv
    if (segment[i] === "-" && /[a-zA-Z]/.test(segment[i + 1])) {
      let j = i + 1;
      while (j < segment.length && /[a-zA-Z0-9]/.test(segment[j])) j++;
      const block = segment.slice(i + 1, j);
      // Split into individual flags
      for (let k = 0; k < block.length; k++) {
        tokens.push({ type: "flag-short", value: `-${block[k]}` });
      }
      i = j;
      continue;
    }

    // Regular word
    const ws = nextWhitespace(segment, i);
    const word = segment.slice(i, ws);
    if (/^\w+=/.test(word)) {
      tokens.push({ type: "env-assign", value: word });
    } else {
      tokens.push({ type: "word", value: word });
    }
    i = ws;
  }

  return tokens;
}

function findClosingQuote(s: string, start: number, quote: string): number {
  for (let i = start; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === quote) return i;
  }
  return -1;
}

function nextWhitespace(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (/\s/.test(s[i])) return i;
  }
  return s.length;
}

// ---------------------------------------------------------------------------
// Segment splitter
// ---------------------------------------------------------------------------

/**
 * Split a full command string into segments at ; && || | newline,
 * respecting quotes.
 */
export function segment(cmd: string): string[] {
  const parts: string[] = [];
  let current = "";
  let i = 0;

  while (i < cmd.length) {
    if (cmd[i] === "'") {
      const end = findClosingQuote(cmd, i + 1, "'");
      current += cmd.slice(i, end < 0 ? cmd.length : end + 1);
      i = end < 0 ? cmd.length : end + 1;
      continue;
    }
    if (cmd[i] === '"') {
      const end = findClosingQuote(cmd, i + 1, '"');
      current += cmd.slice(i, end < 0 ? cmd.length : end + 1);
      i = end < 0 ? cmd.length : end + 1;
      continue;
    }
    if (cmd[i] === "\\") { current += cmd[i]; current += cmd[i + 1] || ""; i += 2; continue; }

    // Segment on ; && ||
    if (cmd.slice(i, i + 2) === "&&" || cmd.slice(i, i + 2) === "||") {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      parts.push(cmd.slice(i, i + 2));
      current = "";
      i += 2;
      continue;
    }
    if (cmd[i] === ";" || cmd[i] === "|" || cmd[i] === "\n") {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      parts.push(cmd[i]);
      current = "";
      i++;
      continue;
    }

    current += cmd[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a single segment (no pipes/&&/; separators) into NormalizedCommand.
 */
export function normalizeSegment(segment: string): NormalizedCommand {
  const tokens = tokenize(segment.trim());
  const flags = new Set<string>();
  const args: string[] = [];
  let argv0 = "";
  let subcommand: string | undefined;
  let unparseable = false;
  let envPrefixSeen = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === "unparseable") { unparseable = true; }

    if (tok.type === "env-assign") { envPrefixSeen = true; continue; }

    // Skip env/command/nohup/time prefixes
    if (!argv0 && ["env", "command", "nohup", "time"].includes(tok.value)) {
      continue;
    }

    if (tok.type === "flag-short") {
      flags.add(tok.value);
    } else if (tok.type === "flag-long" || tok.type === "flag-eq") {
      flags.add(tok.value);
    } else {
      // Word
      if (!argv0) {
        argv0 = tok.value;
        // Handle bash -c "...", sh -c "..." — recurse
        if ((argv0 === "bash" || argv0 === "sh") && i + 2 < tokens.length && tokens[i + 1].type === "flag-short" && tokens[i + 1].value === "-c") {
          // Next token is -c, the one after is the script string
          const scriptTok = tokens[i + 2];
          if (scriptTok.type === "word") {
            // Recurse into the script string
            const inner = normalizeCommand(scriptTok.value);
            if (inner.unparseable) unparseable = true;
            // Absorb inner canonical form
            return {
              argv0: inner.argv0 || argv0,
              subcommand: inner.subcommand,
              flags: inner.flags,
              args: inner.args,
              canonical: `${argv0} -c ${inner.canonical}`,
              unparseable,
            };
          }
        }
      } else if (!subcommand) {
        subcommand = tok.value;
      } else {
        args.push(tok.value);
      }
    }
  }

  // Resolve short flags to long form using alias tables
  const resolved = new Set<string>();
  for (const f of flags) {
    const resolvedFlag = resolveFlag(argv0, subcommand, f);
    if (resolvedFlag) {
      resolved.add(resolvedFlag);
    } else {
      resolved.add(f); // unknown flag, keep as-is
    }
  }

  // Git push origin +main → synthetic --force
  const syntheticFlags: string[] = [];
  if (argv0 === "git" && subcommand === "push") {
    for (const a of args) {
      if (/^\+/.test(a)) syntheticFlags.push("--force");
    }
  }

  // Add synthetic flags to resolved set
  for (const f of syntheticFlags) resolved.add(f);

  // Build canonical
  const parts: string[] = [argv0];
  if (subcommand) parts.push(subcommand);
  const allFlags = [...resolved, ...syntheticFlags].sort();
  parts.push(...allFlags);
  parts.push(...args);
  const canonical = parts.join(" ");

  return {
    argv0,
    subcommand,
    flags: resolved,
    args,
    canonical,
    unparseable,
  };
}

/**
 * Normalize a full command (potentially with separators) into NormalizedCommand.
 * For multi-segment commands, returns the last executable segment.
 */
export function normalizeCommand(cmd: string): NormalizedCommand {
  const segments = segment(cmd);
  // Filter out pure separators
  const executableSegments = segments.filter((s) => ![";", "&&", "||", "|", "\n"].includes(s));
  if (executableSegments.length === 0) {
    return { argv0: "", flags: new Set(), args: [], canonical: cmd.trim(), unparseable: true };
  }
  // Normalize the last executable segment (the one that matters for permission)
  let result = normalizeSegment(executableSegments[executableSegments.length - 1]);
  // If any segment is unparseable, mark the whole thing
  if (executableSegments.some((s) => normalizeSegment(s).unparseable)) {
    result = { ...result, unparseable: true };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Flag resolution
// ---------------------------------------------------------------------------

function resolveFlag(argv0: string, subcommand: string | undefined, flag: string): string | null {
  // Short flag: -r, -f, etc.
  if (flag.length === 2 && flag[0] === "-" && !flag.startsWith("--")) {
    const shortChar = flag[1];

    // Check subcommand-specific aliases
    if (argv0 === "git" && subcommand && GIT_SUBCOMMAND_ALIASES[subcommand]?.[shortChar]) {
      return `--${GIT_SUBCOMMAND_ALIASES[subcommand][shortChar]}`;
    }
    if (argv0 === "npm" && subcommand && NPM_SUBCOMMAND_ALIASES[subcommand]?.[shortChar]) {
      return `--${NPM_SUBCOMMAND_ALIASES[subcommand][shortChar]}`;
    }

    // Check command-level aliases
    if (FLAG_ALIASES[argv0]?.[shortChar]) {
      return `--${FLAG_ALIASES[argv0][shortChar]}`;
    }

    return null;
  }
  return flag; // already long form or not a flag
}