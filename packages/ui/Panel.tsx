/**
 * The injected panel. Rendered inside a Shadow DOM so host CSS cannot reach it and
 * its own styles cannot leak out.
 */

import type { ReadingKey, UsageReading } from '@plimsoll/core/types';
import { withStaleness } from '@plimsoll/core/types';
import { Bar } from './Bar.tsx';
import { formatRelative } from './format.ts';

export type PanelPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'composer';

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
  readonly onToggleCollapsed: () => void;
  readonly onRefresh: () => void;
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
    onToggleCollapsed,
    onRefresh,
  } = props;

  // 'composer' docking is applied by the content script, which positions the host
  // element itself; the panel just renders in flow in that case.
  const positionClass = position === 'composer' ? '' : ` panel--${position}`;
  const shown = readings.filter((r) => visibleBars[r.key]);
  const stale = lastUpdatedAt !== null && now - lastUpdatedAt > stalenessWindowMs;

  return (
    <section className={`panel${positionClass}`} aria-label="Plimsoll usage">
      <div className="header">
        <h2 className="title">Plimsoll</h2>
        <button type="button" onClick={onRefresh} disabled={busy} aria-label="Refresh usage now">
          {busy ? '…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand usage panel' : 'Collapse usage panel'}
        >
          {collapsed ? '+' : '–'}
        </button>
      </div>

      {collapsed ? null : (
        <>
          <ul className="rows">
            {shown.map((reading) => (
              <Bar
                key={reading.key}
                reading={withStaleness(reading, now, stalenessWindowMs)}
                warnAt={warnAt}
                criticalAt={criticalAt}
              />
            ))}
          </ul>

          {shown.length === 0 ? (
            <p className="row__note">No bars enabled. Turn some on in Plimsoll’s options.</p>
          ) : null}

          <div className="footer">
            {/* Freshness is stated explicitly and goes amber when stale, so a cached
                number can never pass for a live one. */}
            <span style={stale ? { color: 'var(--pl-warn)' } : undefined}>
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
