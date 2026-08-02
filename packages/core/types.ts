/**
 * The vocabulary every other module speaks. No DOM, no chrome.*, no I/O.
 *
 * The single most important invariant in Plimsoll lives here: `percent` is
 * `number | null`, and `null` is the ONLY way to say "unknown". Three previous
 * attempts shipped UIs that rendered a confident `0%` for data they had failed to
 * read. A zeroed bar is a lie that looks like data (PROMPT §11.3).
 */

/** Where a reading came from. Always surfaced in the UI — never inferred silently. */
export type Provenance =
  /** Tier 1: authenticated same-origin API response. */
  | 'api'
  /** Tier 2: parsed from the provider's own usage page. */
  | 'usage-page'
  /** Tier 3: estimated from page text. Always labelled. */
  | 'dom-estimate'
  /** No source exists for this signal on this site. Renders "not available". */
  | 'unavailable';

export type ReadingKey = 'context' | 'session' | 'weekly' | 'credits' | 'warning';

export type Confidence = 'exact' | 'estimated' | 'stale';

export type SiteId = 'claude' | 'chatgpt' | 'gemini';

export interface UsageReading {
  readonly key: ReadingKey;
  /** null = unknown. NEVER default to 0. */
  readonly percent: number | null;
  /** e.g. "18% used", "12,400 / 200,000", "not available on this site" */
  readonly primary: string;
  /** e.g. "resets 3:00 PM" */
  readonly secondary?: string;
  readonly provenance: Provenance;
  readonly capturedAt: number;
  readonly confidence: Confidence;
}

/**
 * What a site can actually report — declared as data, not discovered at runtime, so
 * the UI can say "not available on this site" instead of showing an empty bar that
 * implies zero usage.
 */
export type SiteCapabilities = Record<ReadingKey, boolean>;

/**
 * `unknown` is a first-class role, not a fallback bug.
 *
 * Distinguishing "you" from "the assistant" reliably needs a site-specific attribute,
 * and no structural capture exists to confirm one. Rather than alternating roles and
 * hoping — which produces an export that is confidently mislabelled — an
 * unattributable turn is exported as `unknown` and the UI says roles could not be
 * determined.
 */
export interface ConversationMessage {
  readonly role: 'user' | 'assistant' | 'system' | 'unknown';
  readonly text: string;
}

export interface Conversation {
  readonly site: SiteId;
  readonly title: string | null;
  readonly model: string | null;
  readonly capturedAt: number;
  readonly messages: readonly ConversationMessage[];
  /** True when the page virtualises long threads, so messages may be incomplete. */
  readonly truncated: boolean;
}

/** Short label shown on the provenance chip beside every bar. */
export const PROVENANCE_LABEL: Record<Provenance, string> = {
  api: 'live',
  'usage-page': 'page',
  'dom-estimate': 'est.',
  unavailable: 'n/a',
};

/** Longer explanation, used for the chip's tooltip and aria-label. */
export const PROVENANCE_DESCRIPTION: Record<Provenance, string> = {
  api: 'Read directly from the provider',
  'usage-page': "Parsed from the provider's usage page",
  'dom-estimate': 'Estimated from page content — a lower bound',
  unavailable: 'Not available on this site',
};

export const READING_TITLE: Record<ReadingKey, string> = {
  context: 'Context',
  session: 'Session',
  weekly: 'Weekly',
  credits: 'Credits',
  warning: 'Limit warning',
};

/**
 * The canonical "we don't know" reading.
 *
 * Every failure path funnels through this rather than constructing its own zeroed
 * reading, so there is exactly one place in the codebase that decides what unknown
 * looks like — and it is impossible for that place to produce a `0`.
 */
export function unavailableReading(key: ReadingKey, capturedAt: number): UsageReading {
  return {
    key,
    percent: null,
    primary: 'Not available on this site',
    provenance: 'unavailable',
    capturedAt,
    confidence: 'estimated',
  };
}

/** True when a reading carries a usable number. Guards every render path. */
export function hasValue(reading: UsageReading): boolean {
  return reading.percent !== null && Number.isFinite(reading.percent);
}

/**
 * Marks a reading stale once older than `windowMs`. A cached number must never look
 * live (PROMPT §5.2).
 */
export function withStaleness(reading: UsageReading, now: number, windowMs: number): UsageReading {
  if (reading.provenance === 'unavailable') return reading;
  if (now - reading.capturedAt <= windowMs) return reading;
  return { ...reading, confidence: 'stale' };
}

/** Severity band for a percentage. Always paired with text — never colour alone. */
export type Band = 'ok' | 'warn' | 'critical' | 'unknown';

export function bandFor(percent: number | null, warnAt = 75, criticalAt = 90): Band {
  if (percent === null || !Number.isFinite(percent)) return 'unknown';
  if (percent >= criticalAt) return 'critical';
  if (percent >= warnAt) return 'warn';
  return 'ok';
}

/** Text equivalent of the colour band, so state is never conveyed by colour alone. */
export const BAND_LABEL: Record<Band, string> = {
  ok: 'OK',
  warn: 'High',
  critical: 'Very high',
  unknown: 'Unknown',
};
