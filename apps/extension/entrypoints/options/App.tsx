import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { capabilityMatrix, SITE_CONFIGS } from '@plimsoll/adapters/registry';
import type { SelfTestResult } from '@plimsoll/adapters/base';
import {
  DEFAULT_SETTINGS,
  MIN_REFRESH_INTERVAL_MS,
  PlimsollStorage,
  type Settings,
} from '@plimsoll/core/storage';
import { CONTEXT_CEILING_TIERS } from '@plimsoll/core/tokens';
import { READING_TITLE, type ReadingKey } from '@plimsoll/core/types';
import type { Request, Response } from '../../messaging.ts';

const storage = new PlimsollStorage(browser.storage.local);
const BAR_KEYS: readonly ReadingKey[] = ['context', 'session', 'weekly', 'credits', 'warning'];
const ISSUE_URL = 'https://github.com/sariamubeen/plimsoll/issues/new';

type Tab = 'settings' | 'health' | 'data';

export function App() {
  const [tab, setTab] = useState<Tab>('settings');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void storage.getSettings().then(setSettings);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    void storage.setSettings(patch).then(setSettings);
  }, []);

  return (
    <main>
      <h1>Plimsoll</h1>
      <p className="note">
        Read-only. Plimsoll reports usage; it never modifies, bypasses, or extends any provider’s
        limits.
      </p>

      <div className="tabs" role="tablist">
        {(['settings', 'health', 'data'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {id === 'settings' ? 'Settings' : id === 'health' ? 'Health' : 'Data'}
          </button>
        ))}
      </div>

      {tab === 'settings' ? <SettingsTab settings={settings} update={update} /> : null}
      {tab === 'health' ? <HealthTab /> : null}
      {tab === 'data' ? <DataTab /> : null}
    </main>
  );
}

function SettingsTab({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const matrix = capabilityMatrix();

  return (
    <>
      <fieldset>
        <legend>Sites</legend>
        {SITE_CONFIGS.map((config) => (
          <label key={config.id}>
            <input
              type="checkbox"
              checked={settings.sites[config.id]}
              onChange={(e) =>
                update({ sites: { ...settings.sites, [config.id]: e.target.checked } })
              }
            />
            <span className="grow">{config.id}</span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Bars</legend>
        {BAR_KEYS.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={settings.visibleBars[key]}
              onChange={(e) =>
                update({ visibleBars: { ...settings.visibleBars, [key]: e.target.checked } })
              }
            />
            <span className="grow">{READING_TITLE[key]}</span>
          </label>
        ))}
        <p className="note">
          A bar that has no source on a site shows “not available on this site”. It never shows 0%.
        </p>
      </fieldset>

      <fieldset>
        <legend>What each site can report</legend>
        <table>
          <thead>
            <tr>
              <th>Signal</th>
              {SITE_CONFIGS.map((c) => (
                <th key={c.id}>{c.id}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BAR_KEYS.map((key) => (
              <tr key={key}>
                <td>{READING_TITLE[key]}</td>
                {SITE_CONFIGS.map((c) => (
                  <td key={c.id}>{matrix[c.id][key] ? 'yes' : 'not available'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      <fieldset>
        <legend>Panel</legend>
        <label>
          <span className="grow">Position</span>
          <select
            value={settings.position}
            onChange={(e) => update({ position: e.target.value as Settings['position'] })}
          >
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="composer">Docked to composer</option>
          </select>
        </label>
        <label>
          <span className="grow">Theme</span>
          <select
            value={settings.theme}
            onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Thresholds and freshness</legend>
        <label>
          <span className="grow">Amber at</span>
          <input
            type="number"
            min={1}
            max={99}
            value={settings.warnAtPercent}
            onChange={(e) => update({ warnAtPercent: Number(e.target.value) })}
          />
          %
        </label>
        <label>
          <span className="grow">Red at</span>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.criticalAtPercent}
            onChange={(e) => update({ criticalAtPercent: Number(e.target.value) })}
          />
          %
        </label>
        <label>
          <span className="grow">Treat readings as stale after</span>
          <input
            type="number"
            min={1}
            value={Math.round(settings.stalenessWindowMs / 60_000)}
            onChange={(e) => update({ stalenessWindowMs: Number(e.target.value) * 60_000 })}
          />
          min
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.autoRefresh}
            onChange={(e) => update({ autoRefresh: e.target.checked })}
          />
          <span className="grow">Refresh automatically</span>
        </label>
        <label>
          <span className="grow">Auto-refresh every</span>
          <input
            type="number"
            min={Math.round(MIN_REFRESH_INTERVAL_MS / 1000)}
            value={Math.round(settings.refreshIntervalMs / 1000)}
            onChange={(e) => update({ refreshIntervalMs: Number(e.target.value) * 1000 })}
          />
          s
        </label>
        <p className="note">
          Auto-refresh is off by default and never runs faster than once a minute per site. Plimsoll
          reads the provider’s own pages using your existing session, and hammering them would make
          normal use look abusive.
        </p>
      </fieldset>

      <fieldset>
        <legend>Token estimation</legend>
        <label>
          <span className="grow">Characters per token</span>
          <input
            type="number"
            step={0.1}
            min={1}
            value={settings.tokens.charsPerToken}
            onChange={(e) =>
              update({ tokens: { ...settings.tokens, charsPerToken: Number(e.target.value) } })
            }
          />
        </label>
        <label>
          <span className="grow">Default context ceiling</span>
          <select
            value={settings.tokens.defaultCeiling}
            onChange={(e) =>
              update({ tokens: { ...settings.tokens, defaultCeiling: Number(e.target.value) } })
            }
          >
            {CONTEXT_CEILING_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier.toLocaleString('en-US')} tokens
              </option>
            ))}
          </select>
        </label>
        <p className="note">
          These are editable defaults, not facts. Providers publish context sizes per model but not
          per product surface, so the context bar is always an estimate — and a lower bound, since
          offscreen messages are not in the page at all.
        </p>
      </fieldset>
    </>
  );
}

function HealthTab() {
  const [results, setResults] = useState<readonly SelfTestResult[] | null>(null);
  const [checked, setChecked] = useState(false);

  const run = useCallback(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) {
        setChecked(true);
        return;
      }
      try {
        const response: Response | undefined = await browser.tabs.sendMessage(tab.id, {
          type: 'plimsoll:self-test',
        } satisfies Request);
        if (response !== undefined && response.ok && 'results' in response) {
          setResults(response.results);
        }
      } catch {
        setResults(null);
      }
      setChecked(true);
    })();
  }, []);

  useEffect(run, [run]);

  const body = encodeURIComponent(
    `What happened:\n\n\nSite:\n\nSelf-test output:\n${JSON.stringify(results ?? [], null, 2)}\n`,
  );

  return (
    <fieldset>
      <legend>Health</legend>
      <p className="note">
        Which detection strategies currently work on the tab you have open. If a bar is missing,
        this says why.
      </p>
      <button type="button" onClick={run}>
        Re-run checks
      </button>

      {results === null ? (
        <p className="note">
          {checked
            ? 'No Plimsoll panel on the active tab. Open claude.ai, chatgpt.com or gemini.google.com and try again.'
            : 'Checking…'}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Status</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.strategy}>
                <td>
                  <code>{result.strategy}</code>
                </td>
                <td>{result.ok ? 'working' : 'not matching'}</td>
                <td className="note">{result.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="note">
        Site changed and a bar stopped working?{' '}
        <a
          href={`${ISSUE_URL}?title=${encodeURIComponent('Detection broken')}&body=${body}`}
          target="_blank"
          rel="noreferrer"
        >
          Report it with this output prefilled
        </a>
        .
      </p>
    </fieldset>
  );
}

function DataTab() {
  const [status, setStatus] = useState<string | null>(null);

  const exportAll = useCallback(() => {
    void storage.exportAll().then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'plimsoll-data.json';
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }, []);

  const deleteAll = useCallback(() => {
    void storage.deleteAll().then(() => setStatus('All Plimsoll data deleted.'));
  }, []);

  return (
    <fieldset>
      <legend>Your data</legend>
      <p className="note">
        Plimsoll has no server and collects nothing. Everything below lives in this browser only:
        your settings and a local history of readings used for the trend line.
      </p>
      <label>
        <span className="grow">Download everything Plimsoll has stored</span>
        <button type="button" onClick={exportAll}>
          Export JSON
        </button>
      </label>
      <label>
        <span className="grow">Delete all settings and history</span>
        <button type="button" onClick={deleteAll}>
          Delete everything
        </button>
      </label>
      {status === null ? null : <p className="note">{status}</p>}
    </fieldset>
  );
}
