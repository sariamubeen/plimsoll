import { useCallback, useEffect, useMemo, useState } from 'react';
import { runStrategies, type SiteAdapter } from '@plimsoll/adapters/base';
import { composerStrategies } from '@plimsoll/adapters/surface';
import { appendSnapshot, pruneOlderThan } from '@plimsoll/core/history';
import {
  DEFAULT_SETTINGS,
  type PanelPosition,
  type PlimsollStorage,
  type Settings,
} from '@plimsoll/core/storage';
import { hasValue, type UsageReading } from '@plimsoll/core/types';
import { Panel } from '@plimsoll/ui/Panel';

export interface PanelAppProps {
  readonly adapter: SiteAdapter;
  readonly storage: PlimsollStorage;
  readonly onBadge: (percent: number | null) => void;
}

/** Which reading drives the toolbar badge and the collapsed disc. */
const BADGE_PRIORITY = ['weekly', 'session', 'credits', 'context'] as const;

/**
 * Tracks the message box so the panel can sit just above it.
 *
 * Observers only — never `setInterval`. The composer moves when the window resizes,
 * when the textarea grows with a long draft, and when the page scrolls, and each of
 * those has an event worth listening to. Polling would burn a timer on every page the
 * user has open, forever.
 */
function useComposerAnchor(enabled: boolean): React.CSSProperties | undefined {
  const [style, setStyle] = useState<React.CSSProperties | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setStyle(undefined);
      return;
    }

    let observer: ResizeObserver | null = null;

    const update = () => {
      const composer = runStrategies(composerStrategies(document))?.value ?? null;
      if (composer === null) {
        // Composer not found — fall back to a corner rather than pinning the panel to
        // nothing. Silent absence beats a panel stuck at 0,0.
        setStyle({ position: 'fixed', right: '14px', bottom: '14px' });
        return;
      }

      const rect = composer.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        left: `${Math.round(rect.left)}px`,
        top: `${Math.max(8, Math.round(rect.top - 10))}px`,
        transform: 'translateY(-100%)',
        width: `${Math.max(208, Math.min(380, Math.round(rect.width)))}px`,
      });

      observer?.disconnect();
      observer = new ResizeObserver(update);
      observer.observe(composer);
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [enabled]);

  return style;
}

export function PanelApp({ adapter, storage, onBadge }: PanelAppProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [readings, setReadings] = useState<readonly UsageReading[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void storage.getSettings().then(setSettings);
  }, [storage]);

  const anchorStyle = useComposerAnchor(settings.position === 'composer');

  const read = useCallback(() => {
    const next = adapter.getReadings();
    setReadings(next);
    setLastUpdatedAt(Date.now());
    setNow(Date.now());
    return next;
  }, [adapter]);

  // appendSnapshot silently drops unknown readings, so a gap never becomes a recorded
  // zero that later looks like a real measurement.
  const recordHistory = useCallback(
    async (next: readonly UsageReading[]) => {
      const at = Date.now();
      let history = await storage.getHistory();
      for (const reading of next) {
        history = appendSnapshot(history, {
          at,
          site: adapter.id,
          key: reading.key,
          percent: reading.percent,
        });
      }
      await storage.setHistory(pruneOlderThan(history, at));
    },
    [adapter.id, storage],
  );

  useEffect(() => {
    const next = read();
    void recordHistory(next);
    adapter.onUpdate(() => {
      read();
    });
  }, [adapter, read, recordHistory]);

  const badgePercent = useMemo(() => {
    for (const key of BADGE_PRIORITY) {
      const reading = readings.find((r) => r.key === key);
      if (reading !== undefined && hasValue(reading)) return reading.percent;
    }
    return null;
  }, [readings]);

  useEffect(() => {
    onBadge(badgePercent);
  }, [badgePercent, onBadge]);

  const onRefresh = useCallback(() => {
    setBusy(true);
    try {
      const next = read();
      void recordHistory(next);
    } finally {
      setBusy(false);
    }
  }, [read, recordHistory]);

  const onToggleCollapsed = useCallback(() => {
    setSettings((current) => {
      const next = { ...current, collapsed: !current.collapsed };
      void storage.setSettings({ collapsed: next.collapsed });
      return next;
    });
  }, [storage]);

  const onMove = useCallback(
    (position: PanelPosition) => {
      setSettings((current) => ({ ...current, position }));
      void storage.setSettings({ position });
    },
    [storage],
  );

  return (
    <Panel
      readings={readings}
      visibleBars={settings.visibleBars}
      position={settings.position}
      collapsed={settings.collapsed}
      warnAt={settings.warnAtPercent}
      criticalAt={settings.criticalAtPercent}
      stalenessWindowMs={settings.stalenessWindowMs}
      now={now}
      lastUpdatedAt={lastUpdatedAt}
      busy={busy}
      {...(anchorStyle === undefined ? {} : { anchorStyle })}
      onToggleCollapsed={onToggleCollapsed}
      onRefresh={onRefresh}
      onMove={onMove}
    />
  );
}
