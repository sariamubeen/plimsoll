/**
 * The adapter contract, plus the resilience primitive that exists specifically to
 * stop attempt #1 from happening again.
 *
 * Attempt #1 shipped a bare `document.querySelector('[data-testid="user-turn"]')`.
 * It matched nothing, and the panel rendered empty forever. The fix is structural:
 * no DOM lookup in this codebase is a single selector. Every lookup is an ordered
 * chain of named strategies, at least two deep, and the chain reports which one won
 * so `selfTest()` can tell the user what is actually working.
 */

import type { Conversation, SiteCapabilities, SiteId, UsageReading } from '@plimsoll/core/types';

export interface Strategy<T> {
  /** Stable name, shown in the Health tab and in debug logs. */
  readonly name: string;
  readonly fn: () => T | null | undefined;
}

export interface StrategyResult<T> {
  readonly value: T;
  readonly strategy: string;
}

export interface SelfTestResult {
  readonly strategy: string;
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * Runs strategies in order and returns the first non-empty result together with the
 * name of the strategy that produced it.
 *
 * A throwing strategy is treated as a miss, never propagated. A content script that
 * throws into the host page is a bug the user experiences as a broken website, so
 * containment here is not optional (§5.5, "never throw into the host page").
 *
 * Order matters: put geometry and text strategies ABOVE hashed-class ones. Class
 * names change with every redesign; "the lowest visible contenteditable" does not.
 */
export function runStrategies<T>(strategies: readonly Strategy<T>[]): StrategyResult<T> | null {
  for (const strategy of strategies) {
    try {
      const value = strategy.fn();
      if (value !== null && value !== undefined) {
        return { value, strategy: strategy.name };
      }
    } catch {
      // Miss, not a crash. Continue to the next strategy.
    }
  }
  return null;
}

/** Reports which strategies currently resolve. Powers the options-page Health tab. */
export function selfTestStrategies<T>(strategies: readonly Strategy<T>[]): SelfTestResult[] {
  return strategies.map((strategy) => {
    try {
      const value = strategy.fn();
      return value !== null && value !== undefined
        ? { strategy: strategy.name, ok: true }
        : { strategy: strategy.name, ok: false, detail: 'no match' };
    } catch (error) {
      return {
        strategy: strategy.name,
        ok: false,
        detail: error instanceof Error ? error.message : 'threw',
      };
    }
  });
}

export interface SiteAdapter {
  readonly id: SiteId;
  /**
   * Declared, not discovered. A `false` here means "this site has no source for this
   * signal", and the UI says so in words rather than rendering an empty bar.
   */
  readonly capabilities: SiteCapabilities;
  init(): Promise<void>;
  dispose(): void;
  getReadings(): UsageReading[];
  getModelName(): string | null;
  onUpdate(cb: () => void): void;
  selfTest(): Promise<SelfTestResult[]>;
  /** `full` target only — tree-shaken out of `monitor`. */
  extractConversation?(): Promise<Conversation>;
  injectConversation?(conversation: Conversation): Promise<void>;
}

/** Capability set with everything off — the honest default for an unknown site. */
export const NO_CAPABILITIES: SiteCapabilities = {
  context: false,
  session: false,
  weekly: false,
  credits: false,
  warning: false,
};

/**
 * Lowest visible element matching a selector, by viewport position.
 *
 * This is the archetypal geometry strategy: the composer is the bottom-most visible
 * text input on every chat UI, regardless of what its class or test id is called this
 * month.
 */
export function lowestVisible<E extends Element>(root: ParentNode, selector: string): E | null {
  const candidates = [...root.querySelectorAll<E>(selector)].filter((el) => {
    // Duck-typed rather than `instanceof HTMLElement`, so this runs unchanged in a
    // content script, in jsdom, and in a plain Node test with a stub node.
    const { offsetParent } = el as unknown as { offsetParent?: unknown };
    return offsetParent === undefined || offsetParent !== null;
  });
  if (candidates.length === 0) return null;
  return candidates.sort(
    (a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom,
  )[0] as E;
}
