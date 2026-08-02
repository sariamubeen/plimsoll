/**
 * Landmark and geometry strategies shared by all three sites.
 *
 * NOTHING here keys off a hashed class name or an invented `data-testid`. No
 * structural capture exists yet (fixtures/raw/ is empty), so under Standing Rule #1
 * there is no evidence for any site-specific selector and none is written. What IS
 * evidence-free but still safe is standard HTML: `<main>`, `[role="main"]`,
 * `[role="textbox"]`, `contenteditable`, and viewport geometry. PROMPT §5.4 ranks
 * geometry and text strategies above class-based ones precisely because they survive
 * redesigns, so the chains below lead with them.
 *
 * When every strategy misses, the caller gets `null` and renders "not available".
 * It never renders 0%.
 */

import { contextReading, estimateTokens, type TokenSettings } from '@plimsoll/core/tokens';
import { unavailableReading, type UsageReading } from '@plimsoll/core/types';
import { lowestVisible, type Strategy } from './base.ts';

/** innerText where available, textContent otherwise. */
export function elementText(element: Element | null): string {
  if (element === null) return '';
  const { innerText } = element as unknown as { innerText?: string };
  return innerText ?? element.textContent ?? '';
}

/**
 * Largest text-bearing block under body. The last-resort strategy for a page that
 * uses neither <main> nor role="main".
 */
function largestTextContainer(doc: Document): Element | null {
  const candidates = [...doc.querySelectorAll('body > div, body > div > div, section, article')];
  let best: Element | null = null;
  let bestLength = 0;
  for (const candidate of candidates) {
    const length = elementText(candidate).length;
    if (length > bestLength) {
      best = candidate;
      bestLength = length;
    }
  }
  // A handful of characters is chrome, not a conversation.
  return bestLength >= 200 ? best : null;
}

/** Where the conversation lives. */
export function conversationStrategies(doc: Document): Strategy<Element>[] {
  return [
    { name: 'landmark-main', fn: () => doc.querySelector('main') },
    { name: 'role-main', fn: () => doc.querySelector('[role="main"]') },
    { name: 'largest-text-block', fn: () => largestTextContainer(doc) },
  ];
}

/**
 * The composer. Geometry first: on every chat UI ever shipped, the composer is the
 * bottom-most visible text input, whatever its class is called this month.
 */
export function composerStrategies(doc: Document): Strategy<Element>[] {
  return [
    {
      name: 'geometry-lowest-editable',
      fn: () => lowestVisible(doc, 'div[contenteditable="true"], textarea'),
    },
    { name: 'role-textbox', fn: () => doc.querySelector('[role="textbox"]') },
    { name: 'any-textarea', fn: () => doc.querySelector('textarea') },
  ];
}

/**
 * Model name, used only to pick a context ceiling.
 *
 * Both strategies are evidence-free but low-risk: they either match text that is
 * genuinely on the page or return null, and null simply means the configured default
 * ceiling is used. Neither invents a value.
 */
export function modelNameStrategies(doc: Document, pattern: RegExp): Strategy<string>[] {
  return [
    {
      name: 'aria-model-control',
      fn: () => {
        const control = doc.querySelector('[aria-label*="model" i]');
        const text = elementText(control).trim();
        return text.length > 0 && text.length < 60 ? text : null;
      },
    },
    {
      name: 'page-text-pattern',
      fn: () =>
        new RegExp(pattern.source, pattern.flags).exec(elementText(doc.body))?.[0]?.trim() ?? null,
    },
  ];
}

/**
 * Builds the context reading from the conversation surface's text length.
 *
 * `truncated` is always true. The estimate is a lower bound on every one of these
 * sites for two independent reasons: long threads are virtualised so offscreen turns
 * are not in the DOM at all, and the system prompt and tool definitions are never in
 * the DOM. Claiming precision here would be the same class of lie as rendering 0%.
 */
export function estimateContext(
  surface: Element | null,
  settings: TokenSettings,
  ceiling: number,
  capturedAt: number,
): UsageReading {
  if (surface === null) return unavailableReading('context', capturedAt);
  const tokens = estimateTokens(elementText(surface), settings.charsPerToken);
  return contextReading(tokens, ceiling, capturedAt, true);
}

/**
 * Scans page text for a limit warning.
 *
 * Returns null when nothing matches, and the caller then renders NO warning row at
 * all. That is deliberate: "no warning is showing" is a fact, not an unavailable
 * signal, so it should not occupy a bar saying "not available".
 *
 * These patterns are unverified heuristics — no capture of a real warning banner
 * exists yet. A miss therefore costs nothing (silence), and a hit is reported with
 * the matched text so the user can see exactly what was detected rather than
 * trusting a bare flag.
 */
export function detectWarning(
  text: string,
  patterns: readonly RegExp[],
  capturedAt: number,
): UsageReading | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match !== null) {
      return {
        key: 'warning',
        percent: null,
        primary: 'Limit warning on page',
        secondary: match[0].slice(0, 120).trim(),
        provenance: 'dom-estimate',
        capturedAt,
        confidence: 'exact',
      };
    }
  }
  return null;
}

/**
 * Warning phrasings. Deliberately generic and shared: without a capture there is no
 * basis for claiming site-specific wording, so a broad pattern that occasionally
 * misses is more honest than three specific ones invented from memory.
 */
export const COMMON_WARNING_PATTERNS: readonly RegExp[] = [
  /you(?:'ve| have) (?:reached|hit) your [^.]{0,60}limit/i,
  /(?:message|usage) limit reached/i,
  /you are out of (?:messages|usage)/i,
  /limit will reset (?:at|in) [^.]{0,40}/i,
  /upgrade to continue/i,
];
