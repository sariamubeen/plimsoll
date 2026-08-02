/**
 * One adapter implementation, configured three ways.
 *
 * The three sites differ only in which signals they can report, how their model name
 * is exposed, and whether they have a usage page. Everything else — the strategy
 * chains, the estimation, the observers, the honest-degradation rules — is identical,
 * so it lives here once instead of being copied into three near-identical files.
 */

import { ceilingFor, type TokenSettings, DEFAULT_TOKEN_SETTINGS } from '@plimsoll/core/tokens';
import {
  unavailableReading,
  type ReadingKey,
  type SiteCapabilities,
  type SiteId,
  type UsageReading,
} from '@plimsoll/core/types';
import {
  runStrategies,
  selfTestStrategies,
  type SelfTestResult,
  type SiteAdapter,
  type Strategy,
} from './base.ts';
import {
  composerStrategies,
  conversationStrategies,
  detectWarning,
  elementText,
  estimateContext,
} from './surface.ts';

/** A tier-2 source: a page on the site that renders usage directly. */
export interface UsagePageSource {
  /** True when the current location is that page. */
  readonly matches: (url: URL) => boolean;
  /**
   * Reads it. Returns `cacheable: false` when the page rendered an error state, so
   * a failed read is never stored and later mistaken for a real number.
   */
  readonly read: (
    doc: Document,
    capturedAt: number,
  ) => { readings: UsageReading[]; cacheable: boolean } | null;
}

export interface SiteConfig {
  readonly id: SiteId;
  readonly hostPattern: RegExp;
  readonly capabilities: SiteCapabilities;
  readonly modelStrategies: (doc: Document) => Strategy<string>[];
  readonly warningPatterns: readonly RegExp[];
  readonly usagePage?: UsagePageSource;
}

export interface AdapterDeps {
  readonly doc: Document;
  readonly now: () => number;
  readonly getTokenSettings: () => TokenSettings;
  /** Injected rather than read from `doc.location`, so SPA navigation and tests can
   *  both drive it without touching globals. */
  readonly getUrl: () => string;
}

/** Signals that always come from the usage page rather than the conversation DOM. */
const QUOTA_KEYS: readonly ReadingKey[] = ['session', 'weekly', 'credits'];

export function createSiteAdapter(config: SiteConfig, deps: AdapterDeps): SiteAdapter {
  const listeners = new Set<() => void>();
  let observer: MutationObserver | null = null;
  /** Last successful usage-page read, kept so the panel still has a value after the
   *  user navigates away. Always timestamped so the UI can dim it when stale. */
  let cachedQuota: UsageReading[] | null = null;

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A listener must never break the adapter, and the adapter must never throw
        // into the host page.
      }
    }
  };

  const surface = () => runStrategies(conversationStrategies(deps.doc))?.value ?? null;

  const readUsagePage = (): void => {
    const source = config.usagePage;
    if (source === undefined) return;

    let url: URL;
    try {
      url = new URL(deps.getUrl());
    } catch {
      return;
    }
    if (!source.matches(url)) return;

    const result = source.read(deps.doc, deps.now());
    // Refuse to cache an error state (§5.5). Keeping the previous reading and letting
    // it go stale is strictly better than replacing it with a wrong one.
    if (result !== null && result.cacheable) cachedQuota = result.readings;
  };

  const quotaReadings = (capturedAt: number): UsageReading[] =>
    QUOTA_KEYS.map((key) => {
      if (!config.capabilities[key]) return unavailableReading(key, capturedAt);
      const cached = cachedQuota?.find((r) => r.key === key);
      return cached ?? unavailableReading(key, capturedAt);
    });

  return {
    id: config.id,
    capabilities: config.capabilities,

    init(): Promise<void> {
      readUsagePage();
      // Observers, never setInterval (§6.1). Attribute changes are ignored: they fire
      // constantly on these apps and none of them change a usage reading.
      observer = new MutationObserver(() => {
        readUsagePage();
        notify();
      });
      observer.observe(deps.doc.body, { childList: true, subtree: true, characterData: true });
      return Promise.resolve();
    },

    dispose(): void {
      observer?.disconnect();
      observer = null;
      listeners.clear();
    },

    onUpdate(cb: () => void): void {
      listeners.add(cb);
    },

    getModelName(): string | null {
      return runStrategies(config.modelStrategies(deps.doc))?.value ?? null;
    },

    getReadings(): UsageReading[] {
      const capturedAt = deps.now();
      const settings = deps.getTokenSettings();
      const readings: UsageReading[] = [];

      readings.push(
        config.capabilities.context
          ? estimateContext(
              surface(),
              settings,
              ceilingFor(this.getModelName(), settings),
              capturedAt,
            )
          : unavailableReading('context', capturedAt),
      );

      readings.push(...quotaReadings(capturedAt));

      // A warning row appears ONLY when a warning is actually on the page. Absence of
      // a warning is information, not an unavailable signal, so it gets no bar.
      if (config.capabilities.warning) {
        const warning = detectWarning(
          elementText(deps.doc.body),
          config.warningPatterns,
          capturedAt,
        );
        if (warning !== null) readings.push(warning);
      }

      return readings;
    },

    selfTest(): Promise<SelfTestResult[]> {
      const results: SelfTestResult[] = [
        ...selfTestStrategies(conversationStrategies(deps.doc)),
        ...selfTestStrategies(composerStrategies(deps.doc)),
        ...selfTestStrategies(config.modelStrategies(deps.doc)),
      ];

      results.push({
        strategy: 'usage-page-cache',
        ok: cachedQuota !== null,
        detail:
          config.usagePage === undefined
            ? 'no usage page for this site — quota signals are unavailable by design'
            : cachedQuota === null
              ? 'not read yet — visit the usage page once'
              : 'cached',
      });

      // States plainly that tier 1 is absent, so the Health tab explains WHY quota
      // signals may be missing rather than looking simply broken.
      results.push({
        strategy: 'api-endpoint',
        ok: false,
        detail: 'no endpoint verified against a live capture — tier 1 is not implemented',
      });

      return Promise.resolve(results);
    },
  };
}

export const DEFAULT_ADAPTER_DEPS: Pick<AdapterDeps, 'now' | 'getTokenSettings'> = {
  now: () => Date.now(),
  getTokenSettings: () => DEFAULT_TOKEN_SETTINGS,
};
