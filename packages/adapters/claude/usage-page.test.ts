import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseUsagePage, toReadings } from './usage-page.ts';

/**
 * Attempt #2 died here. It returned zero rows against the real page because it
 * assumed the shape of the rendered text: a reset line sat between the label and the
 * value, and a keyword filter on labels excluded the real one.
 *
 * Every trap from PROMPT §4.2 is pinned below. If a future refactor breaks one of
 * these, it breaks the only component that reads real numbers today.
 *
 * The fixture carries SYNTHETIC amounts. The parser does not care about values, and
 * the real figures are the user's private financial data.
 */

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../fixtures/sanitized/claude/${name}`, import.meta.url)),
    'utf8',
  );

const USAGE_PAGE = fixture('usage-page.txt');
const ERROR_PAGE = fixture('usage-page-error.txt');

describe('the §4.2 expected parse', () => {
  const result = parseUsagePage(USAGE_PAGE);

  it('reads all three meters', () => {
    expect(result.error).toBeNull();
    expect(result.meters).toEqual([
      { key: 'session', label: 'Current session', percent: 18, resets: '3:00 PM' },
      { key: 'weekly', label: 'All models', percent: 12, resets: 'Mon 10:59 AM' },
      { key: 'credits', label: '$42.00 spent', percent: 79, resets: 'Aug 1' },
    ]);
  });

  it('reads all four amounts', () => {
    expect(result.amounts).toEqual({
      spent: '$42.00',
      limit: '$42.22',
      balance: '$42.44',
      promo: 'US$42.04',
    });
  });
});

describe('golden file', () => {
  it('matches the committed snapshot', () => {
    // When Anthropic changes the page, this diff is the first readable signal of
    // what moved — far more useful than a pile of individually failing assertions.
    expect(parseUsagePage(USAGE_PAGE)).toMatchSnapshot();
  });
});

describe('trap 1 — a reset line sits between label and value', () => {
  it('walks backwards past "Resets …" to find the label', () => {
    const { meters } = parseUsagePage(USAGE_PAGE);
    // A naive "line above the percentage is the label" reader returns "Resets 3:00 PM".
    expect(meters[0]?.label).toBe('Current session');
    expect(meters[0]?.resets).toBe('3:00 PM');
  });

  it('still parses a meter that has no reset line at all', () => {
    const text = ['Current session', '18% used'].join('\n');
    expect(parseUsagePage(text).meters[0]).toEqual({
      key: 'session',
      label: 'Current session',
      percent: 18,
      resets: null,
    });
  });
});

describe('trap 2 — the weekly label contains no keyword', () => {
  it('accepts "All models", which matches none of session|weekly|usage|limit|plan', () => {
    const { meters } = parseUsagePage(USAGE_PAGE);
    const weekly = meters.find((m) => m.key === 'weekly');
    expect(weekly?.label).toBe('All models');
    expect(weekly?.percent).toBe(12);
  });

  it('keeps an unrecognised label rather than discarding the meter', () => {
    // The label will be renamed eventually. A renamed label must degrade to a
    // positional guess, not to silence.
    const text = ['Current session', '18% used', 'Something Anthropic Renamed', '44% used'].join(
      '\n',
    );
    const { meters } = parseUsagePage(text);
    expect(meters).toHaveLength(2);
    expect(meters[1]).toMatchObject({ key: 'weekly', label: 'Something Anthropic Renamed' });
  });
});

describe('trap 3 — the credits label starts with a currency symbol', () => {
  it('does not exclude currency from the label charset', () => {
    const { meters } = parseUsagePage(USAGE_PAGE);
    const credits = meters.find((m) => m.key === 'credits');
    expect(credits?.label).toBe('$42.00 spent');
    expect(credits?.percent).toBe(79);
  });
});

describe('trap 4 — amounts appear on the line BEFORE their descriptor', () => {
  it('associates each amount with the descriptor that follows it', () => {
    const { amounts } = parseUsagePage(USAGE_PAGE);
    // Reading "descriptor then amount" pairs every value with the wrong label.
    expect(amounts.limit).toBe('$42.22');
    expect(amounts.balance).toBe('$42.44');
    expect(amounts.promo).toBe('US$42.04');
  });
});

describe('trap 5 — "Up to 30% off" must not parse as a meter', () => {
  it('ignores a percentage that is not followed by the word "used"', () => {
    const { meters } = parseUsagePage(USAGE_PAGE);
    expect(meters.map((m) => m.percent)).not.toContain(30);
    expect(meters.every((m) => m.label !== 'Up to 30% off annual plans')).toBe(true);
  });

  it('ignores marketing percentages even with no meters present at all', () => {
    const text = ['Up to 30% off annual plans', 'Save 50% today'].join('\n');
    const result = parseUsagePage(text);
    expect(result.meters).toEqual([]);
    expect(result.error).toBe('no-meters');
  });
});

describe('the error state refuses to produce a reading', () => {
  it('detects "Unable to load usage limits."', () => {
    const result = parseUsagePage(ERROR_PAGE);
    expect(result.error).toBe('load-failed');
    expect(result.meters).toEqual([]);
  });

  it('is marked uncacheable so a wrong reading is never stored', () => {
    expect(parseUsagePage(ERROR_PAGE).cacheable).toBe(false);
    expect(parseUsagePage(USAGE_PAGE).cacheable).toBe(true);
  });
});

describe('resilience — degrade to unavailable, never to 0%', () => {
  const broken: Array<[string, string]> = [
    ['empty', ''],
    ['whitespace only', '   \n\n  \t '],
    ['nav chrome with no meters', 'Claude\nSettings\nUsage\nBilling'],
    ['truncated mid-meter', 'Current session\nResets 3:00 PM'],
    ['percentages with no unit word', 'Current session\n18%\nAll models\n12%'],
  ];

  it.each(broken)('%s does not throw and reports no meters', (_name, text) => {
    expect(() => parseUsagePage(text)).not.toThrow();
    expect(parseUsagePage(text).meters).toEqual([]);
  });

  it('never emits a reading with percent 0 from broken input', () => {
    for (const [, text] of broken) {
      const readings = toReadings(parseUsagePage(text), 1000);
      for (const reading of readings) {
        expect(reading.percent).not.toBe(0);
        expect(reading.percent).toBeNull();
        expect(reading.provenance).toBe('unavailable');
      }
    }
  });

  it('tolerates reordered blocks', () => {
    const reordered = [
      'All models',
      'Resets Mon 10:59 AM',
      '12% used',
      'Current session',
      'Resets 3:00 PM',
      '18% used',
    ].join('\n');
    const { meters } = parseUsagePage(reordered);
    expect(meters.find((m) => m.label === 'Current session')?.percent).toBe(18);
    expect(meters.find((m) => m.label === 'All models')?.percent).toBe(12);
  });

  it('handles CRLF line endings', () => {
    const crlf = USAGE_PAGE.replace(/\n/g, '\r\n');
    expect(parseUsagePage(crlf).meters).toHaveLength(3);
  });
});

describe('conversion to UsageReading', () => {
  it('carries usage-page provenance and the reset time as secondary text', () => {
    const readings = toReadings(parseUsagePage(USAGE_PAGE), 1234);
    const session = readings.find((r) => r.key === 'session');

    expect(session).toMatchObject({
      key: 'session',
      percent: 18,
      primary: '18% used',
      secondary: 'resets 3:00 PM',
      provenance: 'usage-page',
      capturedAt: 1234,
      confidence: 'exact',
    });
  });

  it('reports the spend summary on the credits reading', () => {
    const readings = toReadings(parseUsagePage(USAGE_PAGE), 1234);
    const credits = readings.find((r) => r.key === 'credits');
    expect(credits?.percent).toBe(79);
    expect(credits?.primary).toContain('79%');
  });
});
