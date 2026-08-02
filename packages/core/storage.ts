/**
 * Typed, schema-versioned persistence.
 *
 * `packages/core` stays free of `chrome.*` (PROMPT §5), so this module talks to an
 * injected `StorageArea`. The extension passes `chrome.storage.local`; tests pass an
 * in-memory fake. That keeps every settings/migration path unit-testable without a
 * browser, and it is why `localStorage` never appears anywhere — the lint rule bans
 * it outright.
 */

import type { ReadingKey, SiteId } from './types.ts';
import type { Snapshot } from './history.ts';
import { pruneOldestHalf } from './history.ts';
import { DEFAULT_TOKEN_SETTINGS, type TokenSettings } from './tokens.ts';

/** The subset of the chrome.storage API Plimsoll uses. */
export interface StorageArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  clear(): Promise<void>;
}

export const SCHEMA_VERSION = 1;

export type PanelPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  /** Vertically centred against the left or right edge of the viewport. */
  | 'left'
  | 'right'
  /** Sits just above the message box, tracked with observers rather than polling. */
  | 'composer';

export interface Settings {
  readonly schemaVersion: number;
  readonly sites: Readonly<Record<SiteId, boolean>>;
  readonly visibleBars: Readonly<Record<ReadingKey, boolean>>;
  readonly position: PanelPosition;
  readonly collapsed: boolean;
  /** Auto-refresh defaults to OFF. On-demand refresh is the primary path (§5.3). */
  readonly autoRefresh: boolean;
  /** Never below the 60s floor; clamped on write. */
  readonly refreshIntervalMs: number;
  readonly stalenessWindowMs: number;
  readonly warnAtPercent: number;
  readonly criticalAtPercent: number;
  readonly notificationsEnabled: boolean;
  readonly theme: 'system' | 'light' | 'dark';
  readonly tokens: TokenSettings;
  readonly debug: boolean;
}

export const MIN_REFRESH_INTERVAL_MS = 60_000;

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  sites: { claude: true, chatgpt: true, gemini: true },
  visibleBars: { context: true, session: true, weekly: true, credits: true, warning: true },
  position: 'bottom-right',
  collapsed: false,
  autoRefresh: false,
  refreshIntervalMs: 5 * 60_000,
  stalenessWindowMs: 10 * 60_000,
  warnAtPercent: 75,
  criticalAtPercent: 90,
  notificationsEnabled: false,
  theme: 'system',
  tokens: DEFAULT_TOKEN_SETTINGS,
  debug: false,
};

const SETTINGS_KEY = 'plimsoll:settings';
const HISTORY_KEY = 'plimsoll:history';

/** Deep-ish merge of stored settings over defaults, so new fields appear on upgrade. */
function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    sites: { ...DEFAULT_SETTINGS.sites, ...stored.sites },
    visibleBars: { ...DEFAULT_SETTINGS.visibleBars, ...stored.visibleBars },
    tokens: { ...DEFAULT_SETTINGS.tokens, ...stored.tokens },
    schemaVersion: SCHEMA_VERSION,
  };
}

/**
 * Applies migrations for older schema versions.
 *
 * Version 1 is the initial schema, so there is nothing to migrate yet. The seam
 * exists now so that a future change has an obvious, tested place to live rather
 * than being bolted on later.
 */
function migrate(stored: Partial<Settings> | undefined): Partial<Settings> | undefined {
  return stored;
}

export function clampRefreshInterval(ms: number): number {
  return Math.max(MIN_REFRESH_INTERVAL_MS, Math.floor(ms));
}

export class PlimsollStorage {
  private readonly area: StorageArea;

  constructor(area: StorageArea) {
    this.area = area;
  }

  async getSettings(): Promise<Settings> {
    const raw = await this.area.get([SETTINGS_KEY]);
    const stored = raw[SETTINGS_KEY] as Partial<Settings> | undefined;
    const settings = mergeSettings(migrate(stored));
    return {
      ...settings,
      refreshIntervalMs: clampRefreshInterval(settings.refreshIntervalMs),
    };
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const next = mergeSettings({ ...current, ...patch });
    const clamped = {
      ...next,
      refreshIntervalMs: clampRefreshInterval(next.refreshIntervalMs),
    };
    await this.area.set({ [SETTINGS_KEY]: clamped });
    return clamped;
  }

  async getHistory(): Promise<Snapshot[]> {
    const raw = await this.area.get([HISTORY_KEY]);
    const stored = raw[HISTORY_KEY];
    return Array.isArray(stored) ? (stored as Snapshot[]) : [];
  }

  /**
   * Writes history, shedding the oldest half and retrying once if the quota is
   * exceeded. Losing old trend data is recoverable; failing to record anything ever
   * again is not.
   */
  async setHistory(history: readonly Snapshot[]): Promise<{ pruned: boolean }> {
    try {
      await this.area.set({ [HISTORY_KEY]: history });
      return { pruned: false };
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      await this.area.set({ [HISTORY_KEY]: pruneOldestHalf(history) });
      return { pruned: true };
    }
  }

  /** Everything Plimsoll has stored, for the options-page Data tab export. */
  async exportAll(): Promise<{ settings: Settings; history: Snapshot[]; exportedAt: number }> {
    const [settings, history] = await Promise.all([this.getSettings(), this.getHistory()]);
    return { settings, history, exportedAt: Date.now() };
  }

  /** The delete-everything button. Leaves no Plimsoll state behind. */
  async deleteAll(): Promise<void> {
    await this.area.remove([SETTINGS_KEY, HISTORY_KEY]);
  }
}

export function isQuotaError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'QuotaExceededError' || /quota/i.test(error.message);
  }
  return false;
}

/** In-memory StorageArea, used by unit tests and the E2E fixture harness. */
export function createMemoryStorage(seed: Record<string, unknown> = {}): StorageArea {
  let data: Record<string, unknown> = { ...seed };
  return {
    get: (keys) =>
      Promise.resolve(
        keys === null
          ? { ...data }
          : Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])),
      ),
    set: (items) => {
      data = { ...data, ...items };
      return Promise.resolve();
    },
    remove: (keys) => {
      for (const k of keys) delete data[k];
      return Promise.resolve();
    },
    clear: () => {
      data = {};
      return Promise.resolve();
    },
  };
}
