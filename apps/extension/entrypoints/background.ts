import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import type { Request } from '../messaging.ts';

/**
 * The service worker.
 *
 * It owns the toolbar badge and, once a tier-1 endpoint ever exists, it is where the
 * single-flight rule lives — the worker is a single JS context, which is what makes
 * "five tabs produce one request" true by construction rather than by a lock that
 * cannot be made atomic (see packages/adapters/etiquette.ts).
 *
 * It makes no network requests today, because no endpoint has been verified.
 */
export default defineBackground(() => {
  const setBadge = (percent: number | null, tabId: number | undefined): void => {
    // An unknown reading clears the badge. It must never show "0".
    const text = percent === null ? '' : `${Math.round(percent)}`;
    const colour =
      percent === null
        ? '#6b6b6b'
        : percent >= 90
          ? '#b3261e'
          : percent >= 75
            ? '#8a5300'
            : '#1a7f37';

    void browser.action.setBadgeText(tabId === undefined ? { text } : { text, tabId });
    void browser.action.setBadgeBackgroundColor(
      tabId === undefined ? { color: colour } : { color: colour, tabId },
    );
  };

  // `undefined` is spelled out because exactOptionalPropertyTypes makes `tab?: {...}`
  // and `tab?: {...} | undefined` different types, and MessageSender is the latter.
  type Sender = { tab?: { id?: number | undefined } | undefined };

  browser.runtime.onMessage.addListener((message: unknown, sender: Sender) => {
    const request = message as Request;
    if (request.type === 'plimsoll:badge') {
      setBadge(request.percent, sender.tab?.id);
    }
    // No response needed; returning false keeps the channel from being held open.
    return false;
  });
});
