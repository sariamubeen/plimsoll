import { describe, expect, it } from 'vitest';
import {
  bandFor,
  hasValue,
  PROVENANCE_LABEL,
  unavailableReading,
  withStaleness,
  type UsageReading,
} from './types.ts';
import { ceilingFor, contextReading, estimateTokens, DEFAULT_TOKEN_SETTINGS } from './tokens.ts';
import { appendSnapshot, pruneOlderThan, pruneOldestHalf, seriesFor } from './history.ts';
import { forecastExhaustion } from './forecast.ts';
import {
  clampRefreshInterval,
  createMemoryStorage,
  DEFAULT_SETTINGS,
  MIN_REFRESH_INTERVAL_MS,
  PlimsollStorage,
  type StorageArea,
} from './storage.ts';

const NOW = 1_800_000_000_000;

describe('unknown is never zero', () => {
  it('renders an unavailable signal as n/a with a null percent', () => {
    const reading = unavailableReading('weekly', NOW);
    expect(reading.percent).toBeNull();
    expect(reading.provenance).toBe('unavailable');
    expect(PROVENANCE_LABEL[reading.provenance]).toBe('n/a');
    expect(hasValue(reading)).toBe(false);
    // The failure mode this whole project exists to prevent.
    expect(reading.primary).not.toContain('0%');
  });

  it('treats NaN as unknown rather than as a number', () => {
    const broken = { ...unavailableReading('context', NOW), percent: Number.NaN };
    expect(hasValue(broken)).toBe(false);
    expect(bandFor(broken.percent)).toBe('unknown');
  });

  it('bands a null percent as unknown, not ok', () => {
    expect(bandFor(null)).toBe('unknown');
    expect(bandFor(0)).toBe('ok');
    expect(bandFor(80)).toBe('warn');
    expect(bandFor(95)).toBe('critical');
  });
});

describe('staleness', () => {
  const fresh: UsageReading = {
    key: 'session',
    percent: 18,
    primary: '18% used',
    provenance: 'usage-page',
    capturedAt: NOW,
    confidence: 'exact',
  };

  it('marks a reading stale once past the window', () => {
    expect(withStaleness(fresh, NOW + 5_000, 10_000).confidence).toBe('exact');
    expect(withStaleness(fresh, NOW + 20_000, 10_000).confidence).toBe('stale');
  });

  it('leaves unavailable readings alone — they cannot go stale', () => {
    const na = unavailableReading('credits', NOW);
    expect(withStaleness(na, NOW + 10_000_000, 1_000)).toBe(na);
  });
});

describe('token estimation', () => {
  it('estimates from length and refuses a non-positive divisor', () => {
    expect(estimateTokens('a'.repeat(380), 3.8)).toBe(100);
    expect(estimateTokens('')).toBe(0);
    expect(() => estimateTokens('x', 0)).toThrow(RangeError);
  });

  it('prefers a per-model ceiling and falls back to the default', () => {
    const settings = { ...DEFAULT_TOKEN_SETTINGS, ceilings: { 'model-a': 1_000_000 } };
    expect(ceilingFor('model-a', settings)).toBe(1_000_000);
    expect(ceilingFor('unknown-model', settings)).toBe(settings.defaultCeiling);
    expect(ceilingFor(null, settings)).toBe(settings.defaultCeiling);
  });

  it('returns a null percent rather than dividing by a zero ceiling', () => {
    const reading = contextReading(1000, 0, NOW, false);
    expect(reading.percent).toBeNull();
    expect(reading.primary).toContain('est.');
  });

  it('caps at 100% and says the estimate is a floor when the page is virtualised', () => {
    expect(contextReading(500_000, 200_000, NOW, false).percent).toBe(100);
    expect(contextReading(100, 200_000, NOW, true).secondary).toMatch(/at least/i);
  });
});

describe('history', () => {
  it('never records an unknown reading as a number', () => {
    const out = appendSnapshot([], { at: NOW, site: 'claude', key: 'weekly', percent: null });
    expect(out).toEqual([]);
  });

  it('keeps the series sorted and bounded', () => {
    let h = appendSnapshot([], { at: NOW + 100, site: 'claude', key: 'weekly', percent: 5 });
    h = appendSnapshot(h, { at: NOW, site: 'claude', key: 'weekly', percent: 3 });
    expect(h.map((s) => s.percent)).toEqual([3, 5]);

    const many = Array.from({ length: 10 }, (_, i) => ({
      at: NOW + i,
      site: 'claude' as const,
      key: 'weekly' as const,
      percent: i,
    }));
    const bounded = many.reduce<ReturnType<typeof appendSnapshot>>(
      (acc, s) => appendSnapshot(acc, s, 4),
      [],
    );
    expect(bounded).toHaveLength(4);
    expect(bounded.at(-1)?.percent).toBe(9);
  });

  it('prunes by age and by half', () => {
    const h = [
      { at: NOW - 5000, site: 'claude' as const, key: 'weekly' as const, percent: 1 },
      { at: NOW, site: 'claude' as const, key: 'weekly' as const, percent: 2 },
    ];
    expect(pruneOlderThan(h, NOW, 1000)).toHaveLength(1);
    expect(pruneOldestHalf(h)).toHaveLength(1);
    expect(seriesFor(h, 'claude', 'weekly')).toHaveLength(2);
    expect(seriesFor(h, 'chatgpt', 'weekly')).toHaveLength(0);
  });
});

describe('forecast honesty', () => {
  const rising = (n: number, slopePerHour: number) =>
    Array.from({ length: n }, (_, i) => ({
      at: NOW + i * 30 * 60_000,
      site: 'claude' as const,
      key: 'weekly' as const,
      percent: i * (slopePerHour / 2),
    }));

  it('refuses to forecast from too few samples', () => {
    expect(forecastExhaustion(rising(3, 10), NOW)).toBeNull();
  });

  it('refuses to forecast over too short a timespan', () => {
    const bunched = Array.from({ length: 8 }, (_, i) => ({
      at: NOW + i * 1000,
      site: 'claude' as const,
      key: 'weekly' as const,
      percent: i,
    }));
    expect(forecastExhaustion(bunched, NOW)).toBeNull();
  });

  it('refuses to forecast a flat or falling trend', () => {
    const flat = rising(10, 0);
    expect(forecastExhaustion(flat, NOW)).toBeNull();

    const falling = rising(10, 10).map((s, i) => ({ ...s, percent: 90 - i * 5 }));
    expect(forecastExhaustion(falling, NOW)).toBeNull();
  });

  it('produces a range that brackets the point estimate', () => {
    const forecast = forecastExhaustion(rising(12, 10), NOW);
    expect(forecast).not.toBeNull();
    if (forecast === null) return;
    expect(forecast.ratePerHour).toBeGreaterThan(0);
    expect(forecast.earliestAt).toBeLessThanOrEqual(forecast.exhaustionAt);
    expect(forecast.latestAt).toBeGreaterThanOrEqual(forecast.exhaustionAt);
    expect(forecast.fit).toBeGreaterThan(0.9);
  });

  it('returns null once already at the ceiling', () => {
    const maxed = rising(12, 10).map((s) => ({ ...s, percent: 100 }));
    expect(forecastExhaustion(maxed, NOW)).toBeNull();
  });
});

describe('storage', () => {
  it('returns defaults when nothing is stored', async () => {
    const store = new PlimsollStorage(createMemoryStorage());
    await expect(store.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('defaults auto-refresh to off', () => {
    expect(DEFAULT_SETTINGS.autoRefresh).toBe(false);
  });

  it('clamps the refresh interval to the 60s floor', async () => {
    expect(clampRefreshInterval(1000)).toBe(MIN_REFRESH_INTERVAL_MS);
    const store = new PlimsollStorage(createMemoryStorage());
    const saved = await store.setSettings({ refreshIntervalMs: 5 });
    expect(saved.refreshIntervalMs).toBe(MIN_REFRESH_INTERVAL_MS);
  });

  it('merges newly added defaults over previously stored settings', async () => {
    const area = createMemoryStorage({ 'plimsoll:settings': { theme: 'dark' } });
    const settings = await new PlimsollStorage(area).getSettings();
    expect(settings.theme).toBe('dark');
    expect(settings.sites).toEqual(DEFAULT_SETTINGS.sites);
    expect(settings.schemaVersion).toBe(DEFAULT_SETTINGS.schemaVersion);
  });

  it('sheds the oldest half instead of failing forever on a quota error', async () => {
    let failNext = true;
    const inner = createMemoryStorage();
    const flaky: StorageArea = {
      ...inner,
      set: (items) => {
        if (failNext && 'plimsoll:history' in items) {
          failNext = false;
          const error = new Error('quota exceeded');
          error.name = 'QuotaExceededError';
          return Promise.reject(error);
        }
        return inner.set(items);
      },
    };
    const store = new PlimsollStorage(flaky);
    const history = Array.from({ length: 10 }, (_, i) => ({
      at: NOW + i,
      site: 'claude' as const,
      key: 'weekly' as const,
      percent: i,
    }));

    await expect(store.setHistory(history)).resolves.toEqual({ pruned: true });
    await expect(store.getHistory()).resolves.toHaveLength(5);
  });

  it('exports everything and deletes everything', async () => {
    const store = new PlimsollStorage(createMemoryStorage());
    await store.setSettings({ theme: 'dark' });
    const exported = await store.exportAll();
    expect(exported.settings.theme).toBe('dark');

    await store.deleteAll();
    await expect(store.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(store.getHistory()).resolves.toEqual([]);
  });
});
