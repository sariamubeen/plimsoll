/**
 * The Plimsoll line: a circle bisected by a horizontal bar.
 *
 * This is the load line painted on a ship's hull, marking how heavily it can safely be
 * loaded — the thing the product is named after. Same geometry as the extension icon
 * (see scripts/icons.ts), so the mark is identical everywhere it appears.
 *
 * With a `level`, the disc fills to that percentage like a hull sitting lower in the
 * water. That is the collapsed state of the panel: one glyph that still tells you
 * something. An unknown level leaves the disc empty rather than showing it riding high,
 * which would read as "no load".
 */

export interface MarkProps {
  readonly size?: number;
  /** 0–100, or null for unknown. */
  readonly level?: number | null;
  readonly title?: string;
}

export function Mark({ size = 14, level, title }: MarkProps) {
  const known = level !== null && level !== undefined && Number.isFinite(level);
  const clamped = known ? Math.max(0, Math.min(100, level)) : 0;
  // Waterline measured from the bottom of the disc upward.
  const waterY = 50 + 30 - (clamped / 100) * 60;
  const clipId = `pl-fill-${Math.round(clamped)}`;

  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title === undefined ? 'presentation' : 'img'}
      aria-label={title}
      aria-hidden={title === undefined}
    >
      {known && clamped > 0 ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y={waterY} width="100" height={100 - waterY} />
            </clipPath>
          </defs>
          <circle cx="50" cy="50" r="26" className="mark__flood" clipPath={`url(#${clipId})`} />
        </>
      ) : null}
      <circle cx="50" cy="50" r="30" className="mark__ring" />
      <line x1="6" y1="50" x2="94" y2="50" className="mark__line" />
    </svg>
  );
}
