import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS } from '@plimsoll/core/storage';
import { Bar } from '@plimsoll/ui/Bar';
import type { PanelState, Request, Response } from '../../messaging.ts';

/**
 * Reads state from the content script in the active tab.
 *
 * `chrome.tabs.query` returns a tab id without the "tabs" permission — only `url`,
 * `title` and `favIconUrl` are gated by it — and `tabs.sendMessage` needs only the
 * host permission we already hold. So the popup works with zero extra permissions.
 */
async function requestState(message: Request): Promise<PanelState | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    const response: Response | undefined = await browser.tabs.sendMessage(tab.id, message);
    if (response !== undefined && response.ok && 'state' in response) return response.state;
  } catch {
    // No content script on this tab — an unsupported site, which is not an error.
  }
  return null;
}

export function App() {
  const [state, setState] = useState<PanelState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void requestState({ type: 'plimsoll:get-state' }).then((next) => {
      setState(next);
      setLoaded(true);
    });
  }, []);

  const refresh = useCallback(() => {
    setBusy(true);
    void requestState({ type: 'plimsoll:refresh' })
      .then(setState)
      .finally(() => setBusy(false));
  }, []);

  return (
    <main className="panel" aria-label="Plimsoll usage">
      <div className="header">
        <h1 className="title">Plimsoll</h1>
        <button type="button" onClick={refresh} disabled={busy || state === null}>
          {busy ? '…' : 'Refresh'}
        </button>
      </div>

      {!loaded ? (
        <p className="row__note">Reading…</p>
      ) : state === null ? (
        <p className="row__note">
          Plimsoll works on claude.ai, chatgpt.com and gemini.google.com. Open one of those to see
          usage.
        </p>
      ) : (
        <ul className="rows">
          {state.readings.map((reading) => (
            <Bar
              key={reading.key}
              reading={reading}
              warnAt={DEFAULT_SETTINGS.warnAtPercent}
              criticalAt={DEFAULT_SETTINGS.criticalAtPercent}
            />
          ))}
        </ul>
      )}

      <div className="footer">
        <button type="button" onClick={() => void browser.runtime.openOptionsPage()}>
          Settings
        </button>
        <span>Read-only. Never bypasses a limit.</span>
      </div>
    </main>
  );
}
