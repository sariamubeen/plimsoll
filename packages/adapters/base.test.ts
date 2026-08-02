import { describe, expect, it } from 'vitest';
import { lowestVisible, runStrategies, selfTestStrategies, type Strategy } from './base.ts';

/**
 * Attempt #1 shipped one bare querySelector, it matched nothing, and the panel stayed
 * empty forever with no way to tell why. These tests pin the two properties that stop
 * that recurring: a chain keeps going after a miss, and it reports which link won.
 */

describe('strategy chains', () => {
  it('returns the first hit and names the strategy that produced it', () => {
    const chain: Strategy<string>[] = [
      { name: 'testid', fn: () => null },
      { name: 'geometry', fn: () => 'found-by-geometry' },
      { name: 'role', fn: () => 'never-reached' },
    ];
    expect(runStrategies(chain)).toEqual({
      value: 'found-by-geometry',
      strategy: 'geometry',
    });
  });

  it('treats a throwing strategy as a miss and keeps going', () => {
    // A content script that throws into the host page is experienced by the user as
    // a broken website, so a bad selector must never escape this function.
    const chain: Strategy<string>[] = [
      {
        name: 'explodes',
        fn: () => {
          throw new Error('invalid selector');
        },
      },
      { name: 'fallback', fn: () => 'ok' },
    ];
    expect(() => runStrategies(chain)).not.toThrow();
    expect(runStrategies(chain)?.strategy).toBe('fallback');
  });

  it('returns null when every strategy misses — never a fabricated value', () => {
    const chain: Strategy<string>[] = [
      { name: 'a', fn: () => null },
      { name: 'b', fn: () => undefined },
    ];
    expect(runStrategies(chain)).toBeNull();
  });

  it('does not treat a legitimate falsy result as a miss', () => {
    const chain: Strategy<number>[] = [{ name: 'zero', fn: () => 0 }];
    expect(runStrategies(chain)).toEqual({ value: 0, strategy: 'zero' });
  });
});

describe('selfTest reporting', () => {
  it('reports per-strategy status so the Health tab can explain a breakage', () => {
    const results = selfTestStrategies<string>([
      { name: 'works', fn: () => 'x' },
      { name: 'misses', fn: () => null },
      {
        name: 'throws',
        fn: () => {
          throw new Error('boom');
        },
      },
    ]);

    expect(results).toEqual([
      { strategy: 'works', ok: true },
      { strategy: 'misses', ok: false, detail: 'no match' },
      { strategy: 'throws', ok: false, detail: 'boom' },
    ]);
  });
});

describe('lowestVisible geometry strategy', () => {
  /** Minimal stub node — geometry logic needs no real DOM to be verified. */
  const node = (bottom: number, hidden = false) => ({
    getBoundingClientRect: () => ({ bottom }),
    offsetParent: hidden ? null : {},
  });

  const rootWith = (...nodes: unknown[]): ParentNode =>
    ({ querySelectorAll: () => nodes }) as unknown as ParentNode;

  it('picks the bottom-most visible candidate', () => {
    const bottomMost = node(900);
    const root = rootWith(node(100), bottomMost, node(400));
    expect(lowestVisible(root, 'textarea')).toBe(bottomMost);
  });

  it('ignores hidden candidates even when they sit lower', () => {
    const visible = node(300);
    const root = rootWith(node(999, true), visible);
    expect(lowestVisible(root, 'textarea')).toBe(visible);
  });

  it('returns null when nothing matches', () => {
    expect(lowestVisible(rootWith(), 'textarea')).toBeNull();
  });
});
