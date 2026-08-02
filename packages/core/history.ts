/**
 * Rolling local snapshots of usage readings, used for the trend sparkline and as the
 * input to forecasting. Pure functions over plain arrays — persistence is storage.ts.
 */

import type { ReadingKey, SiteId } from './types.ts';

export interface Snapshot {
  readonly at: number;
  readonly site: SiteId;
  readonly key: ReadingKey;
  readonly percent: number;
}

export const DEFAULT_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const DEFAULT_MAX_SNAPSHOTS = 5000;

/**
 * Appends a snapshot, keeping the series sorted and bounded.
 *
 * Readings with `percent === null` are never recorded. Storing unknown as a number
 * would let a gap in the data masquerade as a real reading of zero later on.
 */
export function appendSnapshot(
  history: readonly Snapshot[],
  candidate: { at: number; site: SiteId; key: ReadingKey; percent: number | null },
  max = DEFAULT_MAX_SNAPSHOTS,
): Snapshot[] {
  if (candidate.percent === null || !Number.isFinite(candidate.percent)) {
    return [...history];
  }
  const next = [
    ...history,
    {
      at: candidate.at,
      site: candidate.site,
      key: candidate.key,
      percent: candidate.percent,
    },
  ];
  next.sort((a, b) => a.at - b.at);
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Drops snapshots older than the retention window. */
export function pruneOlderThan(
  history: readonly Snapshot[],
  now: number,
  windowMs = DEFAULT_HISTORY_WINDOW_MS,
): Snapshot[] {
  const cutoff = now - windowMs;
  return history.filter((s) => s.at >= cutoff);
}

/**
 * Sheds the oldest half of the series. Used on QuotaExceededError, where the choice
 * is between losing old history and losing the ability to record anything at all.
 */
export function pruneOldestHalf(history: readonly Snapshot[]): Snapshot[] {
  return history.slice(Math.floor(history.length / 2));
}

export function seriesFor(
  history: readonly Snapshot[],
  site: SiteId,
  key: ReadingKey,
  since = 0,
): Snapshot[] {
  return history.filter((s) => s.site === site && s.key === key && s.at >= since);
}
