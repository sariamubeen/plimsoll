/**
 * Token estimation and context ceilings.
 *
 * Everything in this file is an ESTIMATE and is labelled as one in the UI.
 *
 * Two honesty constraints from PROMPT §7 are encoded here rather than left to the
 * caller's discretion:
 *
 *  1. Ceilings are editable defaults, not facts. Anthropic documents 200K/500K/1M as
 *     model-dependent (discovery/research.md §2.2) but publishes no per-surface
 *     breakdown, so users can override every number in settings.
 *  2. The estimate is a LOWER BOUND. Sites virtualise long conversations and drop
 *     offscreen messages from the DOM, and Claude auto-summarises earlier messages
 *     near the context limit. A text-length estimate therefore undercounts, and can
 *     even fall mid-conversation. Prefer trend over absolute.
 */

import type { UsageReading } from './types.ts';

/**
 * Characters per token for English prose. A tunable constant, not a truth — exposed
 * in settings. ~3.8 is the usual working figure for English.
 */
export const DEFAULT_CHARS_PER_TOKEN = 3.8;

/**
 * Documented context tiers. Source: Anthropic Help Center, retrieved 2026-08-03
 * (discovery/research.md §2.2). These are defaults the user can edit; Plimsoll does
 * not claim to know which tier a given session is actually on.
 */
export const CONTEXT_CEILING_TIERS = [200_000, 500_000, 1_000_000] as const;

/** Conservative default when the model is unknown — the smallest documented tier. */
export const DEFAULT_CONTEXT_CEILING = 200_000;

export interface TokenSettings {
  readonly charsPerToken: number;
  /** Per-model overrides, keyed by whatever string the adapter reports. */
  readonly ceilings: Readonly<Record<string, number>>;
  readonly defaultCeiling: number;
}

export const DEFAULT_TOKEN_SETTINGS: TokenSettings = {
  charsPerToken: DEFAULT_CHARS_PER_TOKEN,
  ceilings: {},
  defaultCeiling: DEFAULT_CONTEXT_CEILING,
};

/** Estimated token count for a block of text. Never negative. */
export function estimateTokens(text: string, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
  if (charsPerToken <= 0) throw new RangeError('charsPerToken must be positive');
  return Math.max(0, Math.round(text.length / charsPerToken));
}

/** The ceiling to use for a model, falling back to the configured default. */
export function ceilingFor(model: string | null, settings: TokenSettings): number {
  if (model !== null) {
    const exact = settings.ceilings[model];
    if (exact !== undefined && exact > 0) return exact;
  }
  return settings.defaultCeiling;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Builds the context reading from estimated tokens.
 *
 * Returns `percent: null` when the ceiling is unusable, rather than dividing by zero
 * and rendering a meaningless bar.
 */
export function contextReading(
  tokens: number,
  ceiling: number,
  capturedAt: number,
  truncated: boolean,
): UsageReading {
  const usable = ceiling > 0;
  const percent = usable ? Math.min(100, (tokens / ceiling) * 100) : null;

  return {
    key: 'context',
    percent,
    primary: usable
      ? `${formatCount(tokens)} / ${formatCount(ceiling)} (est.)`
      : `${formatCount(tokens)} tokens (est.)`,
    // Say out loud that the number is a floor when the page virtualises messages.
    secondary: truncated ? 'at least — older messages may not be on the page' : 'estimated',
    provenance: 'dom-estimate',
    capturedAt,
    confidence: 'estimated',
  };
}
