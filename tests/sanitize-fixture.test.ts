import { describe, expect, it } from 'vitest';
import { findPii, PII_RULES, scrub, SYNTHETIC_NAME } from '../scripts/pii-patterns.ts';
import { loremOfLength, sanitizeJsonValue } from '../scripts/sanitize-fixture.ts';

/**
 * A synthetic sample carrying one instance of every rule. These are fabricated
 * values that look real; none of them came from an account.
 *
 * This fixture is the proof that the privacy harness works. A no-pii test that has
 * never been shown to fail is indistinguishable from one that always passes.
 */
const SEEDED_PII = [
  'org id 3f2a91c4-7b6e-4d1a-9c88-2e5f7a0b1d33',
  'account org_01H9XKQ2ZP',
  'key sk-ant-api03-abcdefghijklmno',
  'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g',
  'contact real.person@gmail.com',
  'from 192.168.14.201',
  'avatar https://lh3.googleusercontent.com/a/ACg8ocKrealuserid=s96-c',
  '$61.15 spent',
].join('\n');

describe('PII detection', () => {
  it('fires on every rule when given seeded PII', () => {
    const hits = findPii(SEEDED_PII);
    const firedRules = new Set(hits.map((h) => h.ruleId));
    const allRules = PII_RULES.map((r) => r.id);

    // If this fails, some rule is dead and has been silently protecting nothing.
    expect([...firedRules].sort()).toEqual([...allRules].sort());
  });

  it('leaves no residual PII after scrubbing', () => {
    expect(findPii(scrub(SEEDED_PII))).toEqual([]);
  });

  it('is idempotent — scrubbing twice equals scrubbing once', () => {
    const once = scrub(SEEDED_PII);
    expect(scrub(once)).toBe(once);
  });

  it('does not flag its own synthetic output as a leak', () => {
    // The synthetic UUID is still a valid UUID and $42.00 is still currency. The
    // detector has to tell scrubbed from real, not merely match the pattern.
    expect(findPii('00000000-0000-4000-8000-000000000000')).toEqual([]);
    expect(findPii('$42.00 spent')).toEqual([]);
    expect(findPii('user@example.com')).toEqual([]);
  });

  it('finds a real value hiding next to synthetic ones', () => {
    const mixed = `${SYNTHETIC_NAME} 00000000-0000-4000-8000-000000000000 and $61.15`;
    expect(findPii(mixed).map((h) => h.ruleId)).toEqual(['currency']);
  });
});

describe('structure preservation', () => {
  it('keeps currency shape: same digit count and separators', () => {
    expect(scrub('$61.15')).toBe('$42.00');
    expect(scrub('US$38.84')).toBe('US$42.00');
    // Six digits in, six digits out, commas and point where they were.
    expect(scrub('$1,234.56')).toBe('$4,200.00');
    // Length is what a column-aligned text parser depends on.
    expect(scrub('$1,234.56')).toHaveLength('$1,234.56'.length);
  });

  it('keeps prefixed ids the same length', () => {
    const scrubbed = scrub('org_01H9XKQ2ZP');
    expect(scrubbed).toBe('org_0000000000');
    expect(scrubbed).toHaveLength('org_01H9XKQ2ZP'.length);
  });

  it('produces lorem of exactly the requested length', () => {
    for (const n of [0, 1, 7, 140, 5000]) {
      expect(loremOfLength(n)).toHaveLength(n);
    }
  });
});

describe('JSON sanitization', () => {
  it('drops credential-bearing headers entirely', () => {
    const input = {
      headers: {
        Authorization: 'Bearer secret-token-value',
        Cookie: 'sessionKey=abc123',
        'x-api-key': 'sk-live-1234567890',
        'content-type': 'application/json',
      },
    };
    const out = sanitizeJsonValue(input) as { headers: Record<string, unknown> };
    expect(Object.keys(out.headers)).toEqual(['content-type']);
  });

  it('replaces free text with lorem of equal length, preserving key set', () => {
    const input = { title: 'My private conversation about salary', percent: 18 };
    const out = sanitizeJsonValue(input) as { title: string; percent: number };
    expect(Object.keys(out)).toEqual(['title', 'percent']);
    expect(out.title).toHaveLength(input.title.length);
    expect(out.title).not.toContain('salary');
  });

  it('leaves numbers and booleans intact so meters stay realistic', () => {
    const input = { percent: 18, remaining: 0, unlimited: false, resets_at: 1754150400 };
    expect(sanitizeJsonValue(input)).toEqual(input);
  });

  it('replaces person-name fields with a fixed synthetic name', () => {
    const out = sanitizeJsonValue({ full_name: 'Jane Q. Realperson' }) as { full_name: string };
    expect(out.full_name).toBe(SYNTHETIC_NAME);
  });

  it('scrubs PII nested deep inside arrays and objects', () => {
    const input = { orgs: [{ uuid: '3f2a91c4-7b6e-4d1a-9c88-2e5f7a0b1d33' }] };
    expect(findPii(JSON.stringify(sanitizeJsonValue(input)))).toEqual([]);
  });
});
