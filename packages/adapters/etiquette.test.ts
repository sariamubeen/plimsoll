import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage, type StorageArea } from '@plimsoll/core/storage';
import {
  CIRCUIT_BREAK_MS,
  createInProcessMutex,
  EndpointGate,
  MIN_INTERVAL_MS,
  parseRetryAfter,
  type GateDeps,
  type Mutex,
} from './etiquette.ts';

/**
 * These tests protect the USER's account, not a vendor's servers. An extension that
 * fans out five requests because five tabs are open, or that hammers an endpoint
 * through a 429, makes a normal person look like an abuser of their own account.
 */

const START = 1_800_000_000_000;

class Clock {
  t: number;

  constructor(t = START) {
    this.t = t;
  }

  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
}

function makeDeps(
  clock: Clock,
  storage: StorageArea,
  visible = true,
  mutex: Mutex = createInProcessMutex(),
): GateDeps {
  return {
    now: clock.now,
    storage,
    // Fixed jitter keeps backoff deterministic under test.
    random: () => 0.5,
    isVisible: () => visible,
    mutex,
  };
}

describe('single-flight across tabs', () => {
  let clock: Clock;
  let storage: StorageArea;

  beforeEach(() => {
    clock = new Clock();
    storage = createMemoryStorage();
  });

  it('fires exactly one request when five tabs ask at once', async () => {
    // Five tabs coordinated by one service worker: shared mutex, shared storage.
    // This is the whole point of §5.3 — five open claude.ai tabs must produce ONE
    // request, not five.
    const mutex = createInProcessMutex();
    const tabs = Array.from(
      { length: 5 },
      () => new EndpointGate('claude', makeDeps(clock, storage, true, mutex)),
    );

    let fetches = 0;
    const results = await Promise.all(
      tabs.map((gate) =>
        gate.run(async () => {
          fetches += 1;
          await gate.recordSuccess();
          return 'ok';
        }),
      ),
    );

    expect(fetches).toBe(1);
    expect(results.filter((r) => r.outcome === 'granted')).toHaveLength(1);
    expect(results.filter((r) => r.outcome !== 'granted')).toHaveLength(4);
  });

  it('lets the next window through after the interval elapses', async () => {
    const gate = new EndpointGate('claude', makeDeps(clock, storage));
    expect(await gate.acquire()).toBe('granted');
    await gate.recordSuccess();

    clock.advance(MIN_INTERVAL_MS + 1);
    expect(await gate.acquire()).toBe('granted');
  });

  it('reports held-elsewhere rather than running when the lock is busy', async () => {
    const busy: Mutex = { run: () => Promise.resolve('busy' as const) };
    const gate = new EndpointGate('claude', makeDeps(clock, storage, true, busy));

    let ran = false;
    const result = await gate.run(() => {
      ran = true;
      return Promise.resolve('ok');
    });

    expect(ran).toBe(false);
    expect(result.outcome).toBe('held-elsewhere');
  });
});

describe('the 60-second floor', () => {
  it('refuses a second fetch inside the interval and allows it after', async () => {
    const clock = new Clock();
    const gate = new EndpointGate('claude', makeDeps(clock, createMemoryStorage()));

    expect(await gate.acquire()).toBe('granted');
    await gate.recordSuccess();

    clock.advance(MIN_INTERVAL_MS - 1);
    expect(await gate.acquire()).toBe('too-soon');

    clock.advance(2);
    expect(await gate.acquire()).toBe('granted');
  });
});

describe('hidden tabs', () => {
  it('never polls while the document is hidden', async () => {
    const clock = new Clock();
    const gate = new EndpointGate('claude', makeDeps(clock, createMemoryStorage(), false));
    expect(await gate.acquire()).toBe('hidden');

    clock.advance(MIN_INTERVAL_MS * 10);
    expect(await gate.acquire()).toBe('hidden');
  });
});

describe('429 and Retry-After', () => {
  it('honours Retry-After exactly rather than guessing', async () => {
    const clock = new Clock();
    const gate = new EndpointGate('claude', makeDeps(clock, createMemoryStorage()));

    expect(await gate.acquire()).toBe('granted');
    await gate.recordFailure(429, 120);

    expect(await gate.acquire()).toBe('backing-off');
    clock.advance(119_000);
    expect(await gate.acquire()).toBe('backing-off');
    clock.advance(2_000);
    expect(await gate.acquire()).toBe('granted');
  });

  it('backs off exponentially when no Retry-After is supplied', async () => {
    const clock = new Clock();
    const gate = new EndpointGate('claude', makeDeps(clock, createMemoryStorage()));

    await gate.acquire();
    await gate.recordFailure(500);
    const first = (await gate.describe()).backoffUntil - clock.now();

    clock.advance(first + 1);
    await gate.acquire();
    await gate.recordFailure(500);
    const second = (await gate.describe()).backoffUntil - clock.now();

    expect(second).toBeGreaterThan(first);
  });

  it('circuit-breaks for 15 minutes after repeated failures', async () => {
    const clock = new Clock();
    const gate = new EndpointGate('claude', makeDeps(clock, createMemoryStorage()));

    for (let i = 0; i < 3; i++) {
      await gate.acquire();
      await gate.recordFailure(500);
      clock.advance(60_000);
    }

    expect(await gate.acquire()).toBe('circuit-open');
    clock.advance(CIRCUIT_BREAK_MS);
    expect(await gate.acquire()).toBe('granted');
  });

  it('does not escalate a signed-out response into a circuit break', async () => {
    // 401 means "sign in", not "the server is angry". The caller stops polling and
    // shows a sign-in prompt; punishing the user with a 15-minute circuit break
    // would just make the panel look broken after they sign back in.
    const clock = new Clock();
    const gate = new EndpointGate('claude', makeDeps(clock, createMemoryStorage()));

    for (let i = 0; i < 4; i++) {
      await gate.recordFailure(401);
    }
    const state = await gate.describe();
    expect(state.circuitUntil).toBe(0);
    expect(state.failures).toBe(0);
  });
});

describe('parseRetryAfter', () => {
  it('accepts seconds', () => {
    expect(parseRetryAfter('30', START)).toBe(30);
    expect(parseRetryAfter('0', START)).toBe(0);
  });

  it('accepts an HTTP date', () => {
    const future = new Date(START + 60_000).toUTCString();
    const parsed = parseRetryAfter(future, START);
    expect(parsed).toBeGreaterThan(55);
    expect(parsed).toBeLessThanOrEqual(60);
  });

  it('returns undefined for missing or unparseable values', () => {
    expect(parseRetryAfter(null, START)).toBeUndefined();
    expect(parseRetryAfter('', START)).toBeUndefined();
    expect(parseRetryAfter('soon please', START)).toBeUndefined();
  });
});
