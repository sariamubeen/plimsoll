/** Presentation helpers. Pure, so they are unit-testable without a DOM. */

/** "just now" / "4m ago" / "2h ago" — deliberately coarse; precision would be false. */
export function formatRelative(fromMs: number, now: number): string {
  const delta = Math.max(0, now - fromMs);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Whole percentages. Sub-percent precision on an estimate would be theatre. */
export function formatPercent(percent: number | null): string {
  return percent === null || !Number.isFinite(percent) ? 'n/a' : `${Math.round(percent)}%`;
}

/**
 * Width of the filled portion of a bar.
 *
 * Returns 0 for unknown, but the caller must NOT render a 0-width fill as if it were
 * a real reading — Bar renders a hatched "unknown" track instead. Keeping this
 * function total avoids NaN widths leaking into inline styles.
 */
export function fillWidth(percent: number | null): number {
  if (percent === null || !Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}
