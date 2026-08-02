import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SiteAdapter } from '@plimsoll/adapters/base';
import { appendSnapshot, pruneOlderThan } from '@plimsoll/core/history';
import { DEFAULT_SETTINGS, type PlimsollStorage, type Settings } from '@plimsoll/core/storage';
import { hasValue, type UsageReading } from '@plimsoll/core/types';
import { Panel } from '@plimsoll/ui/Panel';

export interface PanelAppProps {
  readonly adapter: SiteAdapter;
  readonly storage: PlimsollStorage;
  readonly onBadge: (percent: number | null) => void;
}

/** Which reading drives the toolbar badge, most-constrained first. */
const BADGE_PRIORITY = ['weekly', 'session', 'credits', 'context'] as const;

export function PanelApp({ adapter, storage, onBadge }: PanelAppProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [readings, setReadings] = useState<readonly UsageReading[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void storage.getSettings().then(setSettings);
  }, [storage]);

  const read = useCallback(() => {
    const next = adapter.getReadings();
    setReadings(next);
    setLastUpdatedAt(Date.now());
    setNow(Date.now());
    return next;
  }, [adapter]);

  // Record a snapshot for the trend sparkline and forecasting. appendSnapshot
  // silently drops unknown readings, so a gap never becomes a recorded zero.
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
      onToggleCollapsed={onToggleCollapsed}
      onRefresh={onRefresh}
    />
  );
}
