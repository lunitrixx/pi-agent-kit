/**
 * model-ref.ts - preflight for the `model` argument of a subagent call.
 *
 * Why this exists, concretely. On 2026-08-10 four of fifteen reviewer runs
 * failed; three of them in under two seconds with
 *
 *   No API key found for anthropic.
 *
 * The calling agent had asked for `model: "anthropic/claude-sonnet-4"`. That
 * string is a perfectly good *OpenRouter model id* - `pi --list-models` lists it
 * under provider `openrouter` - but nothing resolved it that way: the child pi
 * process was launched with `--provider anthropic`, and this machine has
 * credentials for `openrouter` only. The run died before a single model call.
 *
 * The ambiguity is inherent to the string: in `provider/id` the slash separates
 * provider from id, and in `anthropic/claude-sonnet-4` the slash is part of the
 * id. Only the model registry can tell the two apart, and it is available here.
 *
 * So this module answers one question per model reference, from the registry:
 * does the leading segment name a provider we hold credentials for, or is it
 * part of a model id? When it is part of an id, the reference is rewritten to
 * the canonical `provider/id` form, which every resolver reads the same way.
 * When neither reading yields a usable model, the call is refused rather than
 * spent.
 *
 * References without a slash are left exactly as they are. The eleven runs that
 * succeeded that day all asked for `deepseek-v4-pro`, and nothing here touches
 * it.
 */

/** A model as the registry knows it. `fullId` is always `provider/id`. */
export interface ModelEntry {
  provider: string;
  id: string;
}

/** Thinking levels pi accepts as a `:suffix` on a model reference. */
const THINKING_LEVELS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export type ModelVerdict =
  /** Usable as written - hand it through untouched. */
  | { kind: "ok" }
  /** Resolvable, but only in canonical form. Replace `from` with `to`. */
  | { kind: "rewrite"; from: string; to: string; provider: string }
  /** No model this machine can reach. Refuse the call. */
  | { kind: "unavailable"; raw: string; provider: string; suggestions: string[] };

/**
 * Split a trailing `:<thinking-level>` off a model reference. Only known levels
 * are treated as a suffix, because model ids may carry colons of their own
 * (OpenRouter's `:batch`, `:exacto`).
 */
export function splitThinkingSuffix(raw: string): { base: string; suffix: string } {
  const idx = raw.lastIndexOf(":");
  if (idx <= 0) return { base: raw, suffix: "" };
  const tail = raw.slice(idx + 1);
  if (!THINKING_LEVELS.has(tail)) return { base: raw, suffix: "" };
  return { base: raw.slice(0, idx), suffix: raw.slice(idx) };
}

function fullId(entry: ModelEntry): string {
  return `${entry.provider}/${entry.id}`;
}

/**
 * Decide what to do with one model reference.
 *
 * `available` must be the models that actually have credentials configured -
 * `ctx.modelRegistry.getAvailable()`, not `getAll()`. A model without a key is
 * the failure this guards against, so it must not count as a resolution.
 *
 * Fails open: an empty registry, or a reference whose leading segment is a
 * provider we do hold credentials for, is passed through.
 */
export function verifyModelRef(
  raw: string,
  available: ModelEntry[],
  preferredProvider?: string,
): ModelVerdict {
  if (!raw || available.length === 0) return { kind: "ok" };

  const { base, suffix } = splitThinkingSuffix(raw);
  const slash = base.indexOf("/");
  // No slash means no provider/id ambiguity to resolve. pi's own CLI matching
  // handles bare ids, and that is the path the successful runs took.
  if (slash <= 0) return { kind: "ok" };

  // Already canonical - the whole reference is a provider plus that provider's
  // model id.
  if (available.some((entry) => fullId(entry) === base)) return { kind: "ok" };

  // The slash belongs to the model id (`anthropic/claude-sonnet-4` on
  // OpenRouter). Name the provider explicitly so the reference stops depending
  // on who reads it.
  const idMatches = available.filter((entry) => entry.id === base);
  if (idMatches.length > 0) {
    const chosen =
      idMatches.find((entry) => entry.provider === preferredProvider) ?? idMatches[0]!;
    return {
      kind: "rewrite",
      from: raw,
      to: `${fullId(chosen)}${suffix}`,
      provider: chosen.provider,
    };
  }

  const provider = base.slice(0, slash);
  // The leading segment names a provider we can reach, so the reference is a
  // plain model-id typo rather than the credential trap. Leave it to pi.
  if (available.some((entry) => entry.provider === provider)) return { kind: "ok" };

  return {
    kind: "unavailable",
    raw,
    provider,
    suggestions: suggestModels(base, available),
  };
}

/**
 * Reachable models whose id ends in the same last segment as the failed
 * reference - what the caller most likely meant, in the form that works.
 */
export function suggestModels(base: string, available: ModelEntry[], limit = 5): string[] {
  const wanted = base.slice(base.lastIndexOf("/") + 1).toLowerCase();
  if (!wanted) return [];
  const hits = available.filter((entry) => {
    const id = entry.id.toLowerCase();
    return id === wanted || id.endsWith(`/${wanted}`) || id.includes(wanted);
  });
  return hits.slice(0, limit).map(fullId);
}

/**
 * Every model reference an agent can put into a `subagent` call: the `model`
 * argument, the values of `modelOverrides`, and the `model:` literals inside a
 * `workflowScript`. The failing runs used the last of these - the tool told the
 * agent to move the call into a workflow script, and the model argument moved
 * with it.
 */
export function collectModelRefs(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  const refs: string[] = [];

  if (typeof record.model === "string") refs.push(record.model);

  const overrides = record.modelOverrides;
  if (overrides && typeof overrides === "object") {
    for (const value of Object.values(overrides as Record<string, unknown>)) {
      if (typeof value === "string") refs.push(value);
      else if (value && typeof value === "object") {
        const nested = (value as Record<string, unknown>).model;
        if (typeof nested === "string") refs.push(nested);
      }
    }
  }

  if (typeof record.workflowScript === "string") {
    const pattern = /\bmodel\s*:\s*(['"`])([^'"`]+)\1/g;
    for (const match of record.workflowScript.matchAll(pattern)) refs.push(match[2]!);
  }

  return [...new Set(refs.filter((ref) => ref.trim().length > 0))];
}

/**
 * Apply a rewrite to the tool input in place. `event.input` is documented as
 * mutable and mutations reach the executing tool, so this is the supported way
 * to correct an argument instead of refusing a call that is merely misspelled.
 */
export function applyModelRewrite(input: unknown, from: string, to: string): boolean {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;
  let changed = false;

  if (record.model === from) {
    record.model = to;
    changed = true;
  }

  const overrides = record.modelOverrides;
  if (overrides && typeof overrides === "object") {
    for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
      const bag = overrides as Record<string, unknown>;
      if (value === from) {
        bag[key] = to;
        changed = true;
      } else if (value && typeof value === "object") {
        const nested = value as Record<string, unknown>;
        if (nested.model === from) {
          nested.model = to;
          changed = true;
        }
      }
    }
  }

  if (typeof record.workflowScript === "string") {
    const pattern = new RegExp(
      `(\\bmodel\\s*:\\s*)(['"\`])${escapeRegExp(from)}\\2`,
      "g",
    );
    const next = record.workflowScript.replace(pattern, `$1$2${to}$2`);
    if (next !== record.workflowScript) {
      record.workflowScript = next;
      changed = true;
    }
  }

  return changed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
