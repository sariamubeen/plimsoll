/**
 * The single source of truth for what counts as PII in this repo.
 *
 * Two consumers, deliberately sharing one table:
 *   - scripts/sanitize-fixture.ts  uses `pattern` + `replace` to scrub raw captures.
 *   - tests/no-pii.test.ts         uses `pattern` + `isSynthetic` to fail CI on leaks.
 *
 * They must never drift. A rule the sanitizer scrubs but the test does not check is
 * an untested guarantee; a rule the test flags but the sanitizer cannot fix is a
 * permanently red build. Adding a rule here does both jobs at once.
 *
 * Every rule REPLACES rather than deletes, so the sanitized fixture keeps the same
 * shape as the real capture and parsers behave identically on both (PROMPT §2.4).
 */

export interface PiiRule {
  /** Stable identifier, used in test failure messages. */
  readonly id: string;
  /** Human-readable description of what leaks if this rule is removed. */
  readonly description: string;
  /** Global regex locating candidate PII. */
  readonly pattern: RegExp;
  /**
   * Produces the structure-preserving synthetic replacement.
   *
   * `occurrence` is the zero-based index of this match within the file, so a rule
   * can emit distinguishable values. Without it every amount in a capture collapses
   * to the same figure and a fixture can no longer prove that a parser matched the
   * right amount to the right label.
   */
  readonly replace: (match: string, occurrence: number) => string;
  /**
   * True when `match` is already this rule's own synthetic output.
   *
   * Without this the detector eats itself: the synthetic UUID we substitute in is
   * still a valid UUID, and `$42.00` is still a currency amount. The test needs to
   * tell "scrubbed" apart from "real", not merely "matches the pattern".
   */
  readonly isSynthetic: (match: string) => boolean;
}

export const SYNTHETIC_UUID = '00000000-0000-4000-8000-000000000000';
export const SYNTHETIC_EMAIL = 'user@example.com';
export const SYNTHETIC_IP = '0.0.0.0';
export const SYNTHETIC_JWT = 'REDACTED_JWT';
export const SYNTHETIC_AVATAR = 'https://example.com/avatar.png';
export const SYNTHETIC_NAME = 'Example User';

/** Header names dropped wholesale from captured request/response metadata. */
export const FORBIDDEN_HEADERS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
  'anthropic-api-key',
];

/**
 * Rewrites the digits of a currency amount while preserving its exact shape:
 * digit count, grouping commas and decimal point all survive.
 *
 *   $61.15    -> $42.00
 *   $1,234.56 -> $42,000.00
 *
 * The resulting digit string is always "4", then "2", then all zeros, which is what
 * `isSyntheticCurrency` recognises. Shape is what the parser cares about; the real
 * figures are the user's private financial data.
 */
const SYNTHETIC_FILLERS = ['0', '2', '4'] as const;

export function syntheticCurrencyDigits(source: string, occurrence = 0): string {
  const filler = SYNTHETIC_FILLERS[occurrence % SYNTHETIC_FILLERS.length] ?? '0';
  let seen = 0;
  return source.replace(/\d/g, () => {
    const next = seen === 0 ? '4' : seen === 1 ? '2' : filler;
    seen += 1;
    return next;
  });
}

/**
 * Recognises this rule's own output: a leading "42" followed by filler digits drawn
 * from {0,2,4}.
 *
 * The leading 42 is what keeps this tight. Accepting "any amount made of 0/2/4"
 * would silently pass a real `$20.00`, and the whole point of the marker is that a
 * genuine reading cannot be mistaken for a scrubbed one.
 */
function isSyntheticCurrency(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length === 0) return true;
  if (digits.length === 1) return /^[024]$/.test(digits);
  return /^42[024]*$/.test(digits);
}

/**
 * Zero-fills an opaque identifier while keeping its prefix and total length, so
 * `org_01H9XKQ2` becomes `org_00000000` and length-sensitive parsing still works.
 */
function zeroFillAfterPrefix(match: string, separatorIndex: number): string {
  const head = match.slice(0, separatorIndex + 1);
  return head + '0'.repeat(match.length - head.length);
}

export const PII_RULES: readonly PiiRule[] = [
  {
    id: 'jwt',
    description: 'JSON Web Token — may be a live session credential',
    // Checked before uuid/prefixed-id so a token is never partially scrubbed.
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?/g,
    replace: () => SYNTHETIC_JWT,
    isSynthetic: (m) => m === SYNTHETIC_JWT,
  },
  {
    id: 'uuid',
    description: 'UUID — organisation, account, conversation and message identifiers',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replace: () => SYNTHETIC_UUID,
    isSynthetic: (m) => m.toLowerCase() === SYNTHETIC_UUID,
  },
  {
    id: 'prefixed-id',
    description: 'Provider-prefixed opaque id (user_, msg_, conv_, org_, acct_, sess_)',
    pattern:
      /\b(?:user|msg|conv|conversation|org|acct|account|sess|session|cust|sub)_[A-Za-z0-9]{6,}\b/g,
    replace: (m) => zeroFillAfterPrefix(m, m.indexOf('_')),
    isSynthetic: (m) => /^[a-z]+_0+$/.test(m),
  },
  {
    id: 'api-key',
    description: 'Secret key in sk-/pk-/ak- form',
    pattern: /\b(?:sk|pk|ak)-[A-Za-z0-9_-]{8,}\b/g,
    replace: (m) => zeroFillAfterPrefix(m, m.indexOf('-')),
    isSynthetic: (m) => /^[a-z]{2}-0+$/.test(m),
  },
  {
    id: 'email',
    description: 'Email address — directly account-identifying',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replace: () => SYNTHETIC_EMAIL,
    isSynthetic: (m) => m === SYNTHETIC_EMAIL,
  },
  {
    id: 'ipv4',
    description: 'IPv4 address',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
    replace: () => SYNTHETIC_IP,
    isSynthetic: (m) => m === SYNTHETIC_IP,
  },
  {
    id: 'avatar-url',
    description: 'Avatar or profile image URL — often embeds an account id',
    pattern:
      /https?:\/\/[^\s"'<>]*(?:avatar|profile[-_]?(?:image|pic)|googleusercontent)[^\s"'<>]*/gi,
    replace: () => SYNTHETIC_AVATAR,
    isSynthetic: (m) => m === SYNTHETIC_AVATAR,
  },
  {
    id: 'currency',
    description: "Currency amount — the user's real spend, balance and credit",
    // Matches $61.15, US$38.84, £12, €1.234,00 and bare 1,234.56 USD.
    pattern: /(?:US)?[$£€¥]\s?\d[\d,. ]*\d|\b\d[\d,]*\.\d{2}\s?(?:USD|EUR|GBP)\b/g,
    replace: (m, occurrence) => syntheticCurrencyDigits(m, occurrence),
    isSynthetic: isSyntheticCurrency,
  },
];

/**
 * Finds every rule violation in `content` that is not already synthetic.
 * Shared by the sanitizer (to report what it changed) and the privacy test.
 */
export function findPii(content: string): Array<{ ruleId: string; match: string; index: number }> {
  const hits: Array<{ ruleId: string; match: string; index: number }> = [];
  for (const rule of PII_RULES) {
    // Fresh regex per scan: `lastIndex` on a shared /g regex is stateful and would
    // silently skip matches on the second file scanned.
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[0] === '') {
        re.lastIndex += 1;
        continue;
      }
      if (!rule.isSynthetic(m[0])) {
        hits.push({ ruleId: rule.id, match: m[0], index: m.index });
      }
    }
  }
  return hits;
}

/** Applies every rule in order, returning scrubbed text. */
export function scrub(content: string): string {
  let out = content;
  for (const rule of PII_RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let occurrence = 0;
    out = out.replace(re, (match) => {
      if (rule.isSynthetic(match)) return match;
      return rule.replace(match, occurrence++);
    });
  }
  return out;
}
