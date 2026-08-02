/**
 * Parses claude.ai/settings/usage from `document.body.innerText`.
 *
 * This is the only component in Plimsoll that currently reads real quota numbers, and
 * it is the component that killed attempt #2. That attempt assumed the shape of the
 * rendered text and returned zero rows. Four properties of the real page are what
 * broke it, and each one is defended explicitly below and pinned by a test:
 *
 *   1. A "Resets …" line sits BETWEEN the label and the percentage, so the label is
 *      not the line above the value. We walk backwards past reset lines.
 *   2. The weekly label is "All models" — it contains none of
 *      session|weekly|usage|limit|plan. Labels are therefore never filtered by
 *      keyword; keywords only CLASSIFY a label that has already been accepted, and
 *      anything unrecognised falls back to position rather than being dropped.
 *   3. The credits label starts with "$", so currency is not excluded from labels.
 *   4. Standalone amounts appear on the line BEFORE their descriptor.
 *
 * And one false positive: "Up to 30% off" is marketing copy, not a meter. Requiring
 * the literal word "used" after the percentage is what excludes it.
 */

import { unavailableReading, type UsageReading } from '@plimsoll/core/types';

export type MeterKey = 'session' | 'weekly' | 'credits';

export interface UsageMeter {
  readonly key: MeterKey;
  readonly label: string;
  readonly percent: number;
  readonly resets: string | null;
}

export interface UsageAmounts {
  readonly spent?: string;
  readonly limit?: string;
  readonly balance?: string;
  readonly promo?: string;
}

export type UsagePageError = 'load-failed' | 'no-meters';

export interface UsagePageParse {
  readonly error: UsagePageError | null;
  /**
   * False whenever the reading must not be stored. The page intermittently renders
   * "Unable to load usage limits."; caching that would leave a wrong number on screen
   * long after the page recovered (§5.5).
   */
  readonly cacheable: boolean;
  readonly meters: readonly UsageMeter[];
  readonly amounts: UsageAmounts;
}

/** The literal word "used" is the guard against "Up to 30% off" parsing as a meter. */
const PERCENT_USED = /^(\d{1,3})%\s+used$/i;
const RESETS = /^resets\b\s*(.*)$/i;
const LOAD_FAILED = /unable to load usage limits/i;
/** A line that is nothing but an amount — its descriptor is the NEXT line. */
const AMOUNT_ONLY = /^(?:US)?[$£€¥]\s?[\d.,]+$/;
const SPENT_LABEL = /^((?:US)?[$£€¥]\s?[\d.,]+)\s+spent\b/i;
const LEADING_CURRENCY = /^(?:US)?[$£€¥]/;

const METER_ORDER: readonly MeterKey[] = ['session', 'weekly', 'credits'];

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface RawMeter {
  label: string;
  percent: number;
  resets: string | null;
}

/**
 * Finds each "N% used" anchor and walks BACKWARDS to its label, stepping over any
 * number of reset lines on the way.
 *
 * Walking backwards from the value is what makes this robust: the value is the one
 * line whose format we can recognise with confidence, so it is the only safe place
 * to start.
 */
function collectMeters(lines: readonly string[]): RawMeter[] {
  const meters: RawMeter[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = PERCENT_USED.exec(lines[i] ?? '');
    if (match === null) continue;

    const percent = Number(match[1]);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) continue;

    let resets: string | null = null;
    let label: string | null = null;

    for (let j = i - 1; j >= 0; j--) {
      const line = lines[j] ?? '';
      const reset = RESETS.exec(line);
      if (reset !== null) {
        // Keep the reset nearest the value, then keep looking for the label.
        resets ??= reset[1]?.trim() || null;
        continue;
      }
      label = line;
      break;
    }

    // A percentage with nothing above it is not a meter — better no row than a row
    // with an invented name.
    if (label === null || label.length === 0) continue;
    if (PERCENT_USED.test(label)) continue;

    meters.push({ label, percent, resets });
  }

  return meters;
}

/**
 * Assigns a meter key to each label.
 *
 * Keyword matching only classifies; it never rejects. Labels that match nothing keep
 * their meter and take the next unused key in document order, so a rename on
 * Anthropic's side degrades to a possibly-mislabelled bar rather than to silence.
 */
function classify(raw: readonly RawMeter[]): UsageMeter[] {
  const assigned = new Array<MeterKey | null>(raw.length).fill(null);
  const used = new Set<MeterKey>();

  raw.forEach((meter, index) => {
    let key: MeterKey | null = null;
    if (LEADING_CURRENCY.test(meter.label)) key = 'credits';
    else if (/session/i.test(meter.label)) key = 'session';

    if (key !== null && !used.has(key)) {
      assigned[index] = key;
      used.add(key);
    }
  });

  // Second pass so positional fallback never steals a key a later label earned.
  raw.forEach((_meter, index) => {
    if (assigned[index] !== null) return;
    const free = METER_ORDER.find((key) => !used.has(key));
    if (free === undefined) return;
    assigned[index] = free;
    used.add(free);
  });

  return raw.flatMap((meter, index) => {
    const key = assigned[index] ?? null;
    return key === null
      ? []
      : [{ key, label: meter.label, percent: meter.percent, resets: meter.resets }];
  });
}

/** Pairs each standalone amount with the descriptor on the FOLLOWING line. */
function collectAmounts(lines: readonly string[]): UsageAmounts {
  const amounts: {
    spent?: string;
    limit?: string;
    balance?: string;
    promo?: string;
  } = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    const spent = SPENT_LABEL.exec(line);
    if (spent !== null && spent[1] !== undefined) {
      amounts.spent ??= spent[1].trim();
      continue;
    }

    if (!AMOUNT_ONLY.test(line)) continue;
    const descriptor = lines[i + 1] ?? '';

    if (/monthly spend limit/i.test(descriptor)) amounts.limit ??= line;
    else if (/current balance/i.test(descriptor)) amounts.balance ??= line;
    else if (/promotional credit/i.test(descriptor)) amounts.promo ??= line;
  }

  return amounts;
}

export function parseUsagePage(text: string): UsagePageParse {
  const lines = toLines(text);

  if (lines.some((line) => LOAD_FAILED.test(line))) {
    // Explicitly uncacheable. A stored "we couldn't read it" would otherwise be
    // indistinguishable from a real reading later.
    return { error: 'load-failed', cacheable: false, meters: [], amounts: {} };
  }

  const meters = classify(collectMeters(lines));
  if (meters.length === 0) {
    return { error: 'no-meters', cacheable: false, meters: [], amounts: {} };
  }

  return { error: null, cacheable: true, meters, amounts: collectAmounts(lines) };
}

function secondaryFor(meter: UsageMeter, amounts: UsageAmounts): string | undefined {
  const parts: string[] = [];
  if (meter.resets !== null) parts.push(`resets ${meter.resets}`);
  if (meter.key === 'credits') {
    if (amounts.spent !== undefined && amounts.limit !== undefined) {
      parts.push(`${amounts.spent} of ${amounts.limit}`);
    } else if (amounts.spent !== undefined) {
      parts.push(`${amounts.spent} spent`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * Converts a parse into readings, emitting an explicit `unavailable` reading for any
 * meter that was not found.
 *
 * A missing meter must never become `0%`. Every absence routes through
 * `unavailableReading`, which cannot produce a number.
 */
export function toReadings(parse: UsagePageParse, capturedAt: number): UsageReading[] {
  return METER_ORDER.map((key) => {
    const meter = parse.meters.find((m) => m.key === key);
    if (meter === undefined) return unavailableReading(key, capturedAt);

    const secondary = secondaryFor(meter, parse.amounts);
    return {
      key,
      percent: meter.percent,
      primary: `${meter.percent}% used`,
      ...(secondary === undefined ? {} : { secondary }),
      provenance: 'usage-page' as const,
      capturedAt,
      confidence: 'exact' as const,
    };
  });
}
