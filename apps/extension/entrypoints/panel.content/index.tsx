import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { browser } from 'wxt/browser';
import { createRoot, type Root } from 'react-dom/client';
import { HOST_PERMISSIONS, adapterForHost } from '@plimsoll/adapters/registry';
import { PlimsollStorage } from '@plimsoll/core/storage';
import { PANEL_CSS } from '@plimsoll/ui/theme';
import type { Request, Response } from '../../messaging.ts';
import { PanelApp } from './PanelApp.tsx';

/**
 * Injects the usage panel.
 *
 * Two structural rules from PROMPT §5.5 that are easy to get wrong:
 *   - Nothing here may throw into the host page. A content script that throws is
 *     experienced by the user as a broken website, so the whole body is guarded.
 *   - SPA navigation must re-init the adapter WITHOUT leaking observers. These apps
 *     never do a full page load, so `main()` runs once and everything after that is
 *     history-API driven.
 */
export default defineContentScript({
  matches: [...HOST_PERMISSIONS],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',

  async main(ctx) {
    try {
      const storage = new PlimsollStorage(browser.storage.local);
      const settings = await storage.getSettings();

      let adapter = adapterForHost(location.hostname, {
        doc: document,
        now: () => Date.now(),
        getTokenSettings: () => settings.tokens,
        getUrl: () => location.href,
      });
      if (adapter === null) return;

      const site = adapter.id;
      if (!settings.sites[site]) return;

      await adapter.init();

      let root: Root | null = null;
      let rerender: (() => void) | null = null;

      const ui = await createShadowRootUi(ctx, {
        name: 'plimsoll-panel',
        position: 'inline',
        anchor: 'body',
        onMount: (container) => {
          const style = document.createElement('style');
          style.textContent = PANEL_CSS;
          container.appendChild(style);

          const host = document.createElement('div');
          container.appendChild(host);

          root = createRoot(host);
          const render = () => {
            root?.render(
              <PanelApp
                adapter={adapter!}
                storage={storage}
                onBadge={(percent) => {
                  void browser.runtime.sendMessage({
                    type: 'plimsoll:badge',
                    percent,
                  } satisfies Request);
                }}
              />,
            );
          };
          rerender = render;
          render();

          // `full` build only. __PLIMSOLL_FULL__ is a build-time constant, so in the
          // monitor build this branch folds away and the exporter chunk is never
          // emitted — the portability code is absent, not merely disabled.
          if (__PLIMSOLL_FULL__) {
            void import('./exporter.ts').then(({ mountExportControls }) => {
              mountExportControls({ adapter: adapter!, storage, container: host, doc: document });
            });
          }

          return root;
        },
        onRemove: (mounted) => {
          mounted?.unmount();
          root = null;
          rerender = null;
        },
      });

      ui.mount();

      // Answer the popup. chrome.tabs.sendMessage works with host permissions alone,
      // so the popup can read state without Plimsoll requesting "tabs".
      browser.runtime.onMessage.addListener(
        (message: unknown, _sender: unknown, sendResponse: (response: Response) => void) => {
          const request = message as Request;
          if (request.type === 'plimsoll:get-state') {
            const response: Response = {
              ok: true,
              state: {
                site,
                readings: adapter?.getReadings() ?? [],
                lastUpdatedAt: Date.now(),
                modelName: adapter?.getModelName() ?? null,
              },
            };
            sendResponse(response);
            return true;
          }
          if (request.type === 'plimsoll:refresh') {
            rerender?.();
            sendResponse({
              ok: true,
              state: {
                site,
                readings: adapter?.getReadings() ?? [],
                lastUpdatedAt: Date.now(),
                modelName: null,
              },
            });
            return true;
          }
          if (request.type === 'plimsoll:self-test') {
            void adapter
              ?.selfTest()
              .then((results) => sendResponse({ ok: true, results } satisfies Response));
            return true;
          }
          return false;
        },
      );

      // --- SPA navigation -------------------------------------------------------
      // These apps change the URL without a page load, and /settings/usage is reached
      // that way. Re-init on navigation, disposing the previous adapter first so
      // observers do not accumulate one per navigation.
      const onNavigate = () => {
        try {
          adapter?.dispose();
          adapter = adapterForHost(location.hostname, {
            doc: document,
            now: () => Date.now(),
            getTokenSettings: () => settings.tokens,
            getUrl: () => location.href,
          });
          void adapter?.init().then(() => rerender?.());
        } catch {
          // Never surface a navigation hiccup to the host page.
        }
      };

      const patch = (name: 'pushState' | 'replaceState') => {
        // Holding the method as a value is the whole point here — we need the original
        // back to restore it on invalidation, so unbound-method does not apply.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const original = history[name];
        const patched: History['pushState'] = function (this: History, data, unused, url) {
          const result = original.call(history, data, unused, url);
          onNavigate();
          return result;
        };
        history[name] = patched;
        return () => {
          history[name] = original;
        };
      };

      const restorePush = patch('pushState');
      const restoreReplace = patch('replaceState');
      window.addEventListener('popstate', onNavigate);

      ctx.onInvalidated(() => {
        restorePush();
        restoreReplace();
        window.removeEventListener('popstate', onNavigate);
        adapter?.dispose();
      });
    } catch {
      // Containment of last resort. Plimsoll failing must never break the page the
      // user actually came to use.
    }
  },
});
