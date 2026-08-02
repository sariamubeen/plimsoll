/**
 * One gauge row.
 *
 * The rule this component exists to enforce: a reading with no value renders as a
 * hatched track and the literal text "n/a", never as an empty bar. An empty bar is
 * indistinguishable from 0% used.
 */

import {
  BAND_LABEL,
  bandFor,
  hasValue,
  PROVENANCE_DESCRIPTION,
  PROVENANCE_LABEL,
  READING_TITLE,
  type UsageReading,
} from '@plimsoll/core/types';
import { fillWidth, formatPercent } from './format.ts';

export interface BarProps {
  readonly reading: UsageReading;
  readonly warnAt: number;
  readonly criticalAt: number;
}

export function Bar({ reading, warnAt, criticalAt }: BarProps) {
  const known = hasValue(reading);
  const band = bandFor(reading.percent, warnAt, criticalAt);
  const stale = reading.confidence === 'stale';

  // The accessible name carries everything a sighted user gets from colour, position
  // and the chip — state is never conveyed by colour alone.
  const label = [
    READING_TITLE[reading.key],
    known ? `${formatPercent(reading.percent)} used` : 'not available',
    known ? BAND_LABEL[band] : null,
    PROVENANCE_DESCRIPTION[reading.provenance],
    stale ? 'stale' : null,
  ]
    .filter((part) => part !== null)
    .join(', ');

  // Detail is one line and clips rather than wrapping. A HUD that reflows as numbers
  // change is worse than one that stays put; the full text is in the title.
  const detail = [reading.primary, reading.secondary, stale ? 'stale' : null]
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' · ');

  return (
    <li className={`row${stale ? ' row--stale' : ''}`}>
      <div className="row__head">
        <span className="row__title">{READING_TITLE[reading.key]}</span>
        <span className="chip" title={PROVENANCE_DESCRIPTION[reading.provenance]}>
          {PROVENANCE_LABEL[reading.provenance]}
        </span>
        <span className="row__value">{formatPercent(reading.percent)}</span>
      </div>

      <div
        className={`gauge${known ? '' : ' gauge--unknown'}`}
        role="meter"
        aria-label={label}
        {...(known
          ? {
              'aria-valuenow': Math.round(reading.percent ?? 0),
              'aria-valuemin': 0,
              'aria-valuemax': 100,
            }
          : // No aria-valuenow at all when unknown. Announcing 0 would be the
            // accessibility equivalent of rendering an empty bar.
            { 'aria-valuetext': 'not available' })}
      >
        {known ? (
          <div
            className={`gauge__fill gauge__fill--${band}`}
            style={{ width: `${fillWidth(reading.percent)}%` }}
          />
        ) : null}
      </div>

      <div className="row__note" title={detail}>
        {known ? `${BAND_LABEL[band]} · ` : ''}
        {detail}
      </div>
    </li>
  );
}
