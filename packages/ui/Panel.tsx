/**
 * The injected panel. Shadow DOM, styles scoped both directions.
 *
 * Two layout decisions worth stating, both about respecting the page underneath:
 *
 *   - Signals with no source on this site collapse to ONE quiet line naming them,
 *     instead of a stack of empty gauges. Three hatched bars saying "nothing here"
 *     was half the panel's height spent on absence.
 *   - Collapsed, the panel is a single load-line disc showing the most constrained
 *     reading. Still useful, nearly invisible.
 */

import { useState } from 'react';
import {
  hasValue,
  READING_TITLE,
  withStaleness,
  type ReadingKey,
  type UsageReading,
} from '@plimsoll/core/types';
import { Bar } from './Bar.tsx';
import { Mark } from './Mark.tsx';
import { formatRelative } from './format.ts';

export type PanelPosition =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'composer';

/** Order matters: the most constrained signal drives the collapsed disc. */
const PRIORITY: readonly ReadingKey[] = ['weekly', 'session', 'credits', 'context'];

const PLACES: ReadonlyArray<{ id: PanelPosition; glyph: string; label: string }> = [
  { id: 'top-left', glyph: '◤', label: 'Top left' },
  { id: 'top-right', glyph: '◥', label: 'Top right' },
  { id: 'left', glyph: '◧', label: 'Left edge' },
  { id: 'right', glyph: '◨', label: 'Right edge' },
  { id: 'bottom-left', glyph: '◣', label: 'Bottom left' },
  { id: 'bottom-right', glyph: '◢', label: 'Bottom right' },
];

export interface PanelProps {
  readonly readings: readonly UsageReading[];
  readonly visibleBars: Readonly<Record<ReadingKey, boolean>>;
  readonly position: PanelPosition;
  readonly collapsed: boolean;
  readonly warnAt: number;
  readonly criticalAt: number;
  readonly stalenessWindowMs: number;
  readonly now: number;
  readonly lastUpdatedAt: number | null;
  readonly busy: boolean;
  /** Coordinates supplied by the content script when docked to the composer. */
  readonly anchorStyle?: React.CSSProperties;
  readonly onToggleCollapsed: () => void;
  readonly onRefresh: () => void;
  readonly onMove: (position: PanelPosition) => void;
}

export function Panel(props: PanelProps) {
  const {
    readings,
    visibleBars,
    position,
    collapsed,
    warnAt,
    criticalAt,
    stalenessWindowMs,
    now,
    lastUpdatedAt,
    busy,
    anchorStyle,
    onToggleCollapsed,
    onRefresh,
    onMove,
  } = props;

  const [placing, setPlacing] = useState(false);

  const shown = readings.filter((r) => visibleBars[r.key]);
  const available = shown.filter((r) => r.provenance !== 'unavailable');
  const missing = shown.filter((r) => r.provenance === 'unavailable');
  const stale = lastUpdatedAt !== null && now - lastUpdatedAt > stalenessWindowMs;

  const lead = PRIORITY.map((key) => available.find((r) => r.key === key)).find(
    (r) => r !== undefined && hasValue(r),
  );

  return (
    <section
      className={`panel panel--${position}${collapsed ? ' panel--collapsed' : ''}`}
      style={anchorStyle}
      aria-label="Plimsoll usage"
    >
      <div className="header">
        <Mark size={15} level={lead?.percent ?? null} />
        {collapsed ? null : <h2 className="wordmark">Plimsoll</h2>}

        {collapsed ? null : (
          <>
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              title="Refresh now"
              aria-label="Refresh usage now"
            >
              {busy ? '⋯' : '↻'}
            </button>

            <span className="placer">
              <button
                type="button"
                onClick={() => setPlacing((open) => !open)}
                aria-expanded={placing}
                title="Move panel"
                aria-label="Move panel"
              >
                ⤢
              </button>

              {placing ? (
                <div className="placer__menu" role="group" aria-label="Panel position">
                  {PLACES.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      aria-pressed={position === place.id}
                      title={place.label}
                      aria-label={place.label}
                      onClick={() => {
                        onMove(place.id);
                        setPlacing(false);
                      }}
                    >
                      {place.glyph}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="placer__wide"
                    aria-pressed={position === 'composer'}
                    title="Sit just above the message box"
                    onClick={() => {
                      onMove('composer');
                      setPlacing(false);
                    }}
                  >
                    Above message box
                  </button>
                </div>
              ) : null}
            </span>
          </>
        )}

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand usage panel' : 'Collapse usage panel'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {collapsed ? null : (
        <>
          {available.length > 0 ? (
            <ul className="rows">
              {available.map((reading) => (
                <Bar
                  key={reading.key}
                  reading={withStaleness(reading, now, stalenessWindowMs)}
                  warnAt={warnAt}
                  criticalAt={criticalAt}
                />
              ))}
            </ul>
          ) : null}

          {/* Absence, stated once. */}
          {missing.length > 0 ? (
            <p className="unavailable">
              Not available on this site:{' '}
              <span className="unavailable__names">
                {missing.map((r) => READING_TITLE[r.key]).join(', ')}
              </span>
            </p>
          ) : null}

          {shown.length === 0 ? (
            <p className="unavailable">No gauges enabled. Turn some on in Plimsoll’s settings.</p>
          ) : null}

          <div className="footer">
            <span className={stale ? 'footer__stale' : undefined}>
              {lastUpdatedAt === null
                ? 'Not read yet'
                : `Updated ${formatRelative(lastUpdatedAt, now)}${stale ? ' · stale' : ''}`}
            </span>
          </div>
        </>
      )}

      <p className="visually-hidden">
        Plimsoll is read-only. It reports usage and never modifies, bypasses, or extends any
        provider’s limits.
      </p>
    </section>
  );
}
