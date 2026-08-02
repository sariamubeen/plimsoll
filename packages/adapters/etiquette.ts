/**
 * Request etiquette for undocumented, authenticated endpoints (PROMPT §5.3).
 *
 * Tier 1 hits an endpoint on the user's OWN signed-in session. Behaving badly here
 * doesn't inconvenience a vendor — it makes a normal user look like an abuser of
 * their own account. Every rule below exists to protect the person running the
 * extension:
 *
 *   - at most one request per site per 60 seconds
 *   - five open tabs produce ONE request, not five
 *   - never poll a hidden tab
 *   - honour 429 and Retry-After, back off with jitter, circuit-break after repeats
 *
 * Timing and randomness are injected so all of this is deterministically testable.
 */

import type { StorageArea } from '@plimsoll/core/storage';

export const MIN_INTERVAL_MS = 60_000;
export const CIRCUIT_BREAK_MS = 15 * 60_000;
export const MAX_FAILURES = 3;

export type AcquireOutcome =
  'granted' | 'too-soon' | 'held-elsewhere' | 'backing-off' | 'circuit-open' | 'hidden';

interface GateState {
  lastSuccessAt: number;
  failures: number;
  backoffUntil: number;
  circuitUntil: number;
}

const EMPTY_STATE: GateState = {
  lastSuccessAt: 0,
  failures: 0,
  backoffUntil: 0,
  circuitUntil: 0,
};

/**
 * Mutual exclusion for the "only one fetch in flight" rule.
 *
 * This is deliberately NOT built on chrome.storage. A read-then-write "lock" in
 * storage cannot be made correct: there is no atomic compare-and-set, so with
 * last-writer-wins semantics an early claimant reads its own token back before a
 * later tab writes, and every tab concludes it holds the lock. That produces exactly
 * the fan-out single-flight is supposed to prevent.
 *
 * Correctness comes from a real primitive instead:
 *   - In the service worker there is only ONE context, so an in-process queue is
 *     genuinely exclusive. This is where §5.3 says the rule belongs.
 *   - Where several same-origin contexts exist, the Web Locks API provides true
 *     cross-context exclusion.
 */
export interface Mutex {
  /** Runs `fn` exclusively, or resolves to 'busy' without waiting. */
  run<T>(name: string, fn: () => Promise<T>): Promise<T | 'busy'>;
}

/** Exclusive within a single JS context — correct for the service worker. */
export function createInProcessMutex(): Mutex {
  const held = new Set<string>();
  return {
    async run<T>(name: string, fn: () => Promise<T>): Promise<T | 'busy'> {
      if (held.has(name)) return 'busy';
      held.add(name);
      try {
        return await fn();
      } finally {
        held.delete(name);
      }
    },
  };
}

/** True cross-context exclusion via the Web Locks API, with a graceful fallback. */
export function createWebLocksMutex(fallback: Mutex = createInProcessMutex()): Mutex {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (!locks) return fallback;
  return {
    async run<T>(name: string, fn: () => Promise<T>): Promise<T | 'busy'> {
      return locks.request(name, { ifAvailable: true }, async (lock) =>
        lock === null ? 'busy' : await fn(),
      );
    },
  };
}

export interface GateDeps {
  readonly now: () => number;
  /** Persists timing state across service-worker restarts. */
  readonly storage: StorageArea;
  /** Injected for deterministic jitter in tests. */
  readonly random: () => number;
  /** Returns true when the document is visible. Never poll a hidden tab. */
  readonly isVisible: () => boolean;
  /** Provides the actual mutual exclusion. */
  readonly mutex: Mutex;
}

export interface GateOptions {
  readonly minIntervalMs?: number;
}

export class EndpointGate {
  private readonly key: string;
  private readonly minIntervalMs: number;
  private readonly deps: GateDeps;

  constructor(site: string, deps: GateDeps, options: GateOptions = {}) {
    this.deps = deps;
    this.key = `plimsoll:gate:${site}`;
    this.minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
  }

  private async read(): Promise<GateState> {
    const raw = await this.deps.storage.get([this.key]);
    const stored = raw[this.key];
    return stored ? { ...EMPTY_STATE, ...(stored as Partial<GateState>) } : { ...EMPTY_STATE };
  }

  private async write(state: GateState): Promise<void> {
    await this.deps.storage.set({ [this.key]: state });
  }

  /**
   * Checks every timing rule that can be evaluated without holding the lock.
   *
   * This answers "are we allowed to fetch right now", not "are we the one doing it".
   * Exclusivity is `run()`'s job, because only a real mutex can provide it.
   */
  async acquire(): Promise<AcquireOutcome> {
    if (!this.deps.isVisible()) return 'hidden';

    const now = this.deps.now();
    const state = await this.read();

    if (now < state.circuitUntil) return 'circuit-open';
    if (now < state.backoffUntil) return 'backing-off';
    if (now - state.lastSuccessAt < this.minIntervalMs) return 'too-soon';

    return 'granted';
  }

  /**
   * The single entry point callers should use: takes the lock, re-checks the timing
   * rules while holding it, and only then runs `fn`.
   *
   * The re-check inside the lock is what makes five tabs produce one request. Without
   * it, all five could pass `acquire()` before any of them records success.
   */
  async run<T>(fn: () => Promise<T>): Promise<{ outcome: AcquireOutcome; value?: T }> {
    const pre = await this.acquire();
    if (pre !== 'granted') return { outcome: pre };

    const result = await this.deps.mutex.run(this.key, async () => {
      const inside = await this.acquire();
      if (inside !== 'granted') return { outcome: inside } as const;
      return { outcome: 'granted' as const, value: await fn() };
    });

    if (result === 'busy') return { outcome: 'held-elsewhere' };
    return result;
  }

  async recordSuccess(): Promise<void> {
    const now = this.deps.now();
    const state = await this.read();
    await this.write({
      ...state,
      lastSuccessAt: now,
      failures: 0,
      backoffUntil: 0,
      circuitUntil: 0,
    });
  }

  /**
   * Records a failed attempt and schedules the next permitted one.
   *
   * `Retry-After` always wins when the server sends it — it is the provider telling
   * us exactly what it wants, and second-guessing it is how an account gets flagged.
   */
  async recordFailure(status?: number, retryAfterSeconds?: number): Promise<void> {
    const now = this.deps.now();
    const state = await this.read();
    const failures = state.failures + 1;

    const backoffMs =
      retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : this.exponentialBackoff(failures);

    const circuitUntil = failures >= MAX_FAILURES ? now + CIRCUIT_BREAK_MS : state.circuitUntil;

    await this.write({
      ...state,
      failures,
      backoffUntil: now + backoffMs,
      circuitUntil,
      // A 401/403 is not a transient fault; the caller stops polling entirely and
      // shows "sign in to see usage", so no backoff escalation is warranted.
      ...(status === 401 || status === 403 ? { failures: 0, circuitUntil: 0 } : {}),
    });
  }

  /** Exponential backoff with full jitter: 2^n seconds, randomised, capped at 5 min. */
  private exponentialBackoff(failures: number): number {
    const base = Math.min(2 ** failures * 1000, 5 * 60_000);
    return Math.floor(base * (0.5 + this.deps.random() * 0.5));
  }

  /** Clears all gate state. Used by the Data tab's delete-everything button. */
  async reset(): Promise<void> {
    await this.write({ ...EMPTY_STATE });
  }

  async describe(): Promise<GateState> {
    return this.read();
  }
}

/** Parses a Retry-After header in either seconds or HTTP-date form. */
export function parseRetryAfter(header: string | null, now: number): number | undefined {
  if (header === null || header.trim() === '') return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, (date - now) / 1000);
}
