// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TOKEN_SETTINGS } from '@plimsoll/core/tokens';
import { hasValue } from '@plimsoll/core/types';
import { createSiteAdapter, type AdapterDeps } from './site-adapter.ts';
import { claudeConfig } from './claude/index.ts';
import { chatgptConfig } from './chatgpt/index.ts';
import { geminiConfig } from './gemini/index.ts';
import {
  adapterForHost,
  capabilityMatrix,
  configForHost,
  HOST_PERMISSIONS,
  SITE_CONFIGS,
} from './registry.ts';

const NOW = 1_800_000_000_000;

// Resolved with node:path rather than `new URL(...)`: happy-dom substitutes its own
// URL implementation, which does not resolve relative file: URLs the same way.
const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(join(HERE, '..', '..', 'fixtures', 'sanitized', 'claude', name), 'utf8');

function deps(url: string): AdapterDeps {
  return {
    doc: document,
    now: () => NOW,
    getTokenSettings: () => DEFAULT_TOKEN_SETTINGS,
    getUrl: () => url,
  };
}

/** happy-dom has no layout engine, so innerText is absent — set textContent. */
function setBody(text: string): void {
  document.body.innerHTML = '';
  const main = document.createElement('main');
  main.textContent = text;
  document.body.appendChild(main);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('registry', () => {
  it('matches exactly the three supported hosts', () => {
    expect(configForHost('claude.ai')?.id).toBe('claude');
    expect(configForHost('chatgpt.com')?.id).toBe('chatgpt');
    expect(configForHost('gemini.google.com')?.id).toBe('gemini');
  });

  it('does not match lookalike hosts', () => {
    // A sloppy pattern like /claude\.ai/ would match all of these.
    expect(configForHost('claude.ai.evil.com')).toBeNull();
    expect(configForHost('notclaude.ai')).toBeNull();
    expect(configForHost('example.com')).toBeNull();
    expect(adapterForHost('example.com', deps('https://example.com'))).toBeNull();
  });

  it('requests three narrow host permissions and never <all_urls>', () => {
    expect(HOST_PERMISSIONS).toHaveLength(3);
    expect(HOST_PERMISSIONS).not.toContain('<all_urls>');
    for (const permission of HOST_PERMISSIONS) {
      expect(permission.startsWith('https://')).toBe(true);
    }
  });
});

describe('capability matrix is honest', () => {
  it('declares quota signals available only where evidence exists', () => {
    const matrix = capabilityMatrix();

    // Backed by the §4.2 usage-page transcription.
    expect(matrix.claude).toMatchObject({ session: true, weekly: true, credits: true });

    // No primary source and no capture — these must NOT claim availability.
    expect(matrix.chatgpt).toMatchObject({ session: false, weekly: false, credits: false });
    expect(matrix.gemini).toMatchObject({ session: false, weekly: false, credits: false });
  });

  it('offers a context estimate everywhere', () => {
    for (const config of SITE_CONFIGS) {
      expect(config.capabilities.context).toBe(true);
    }
  });
});

describe('sites without a usage source say so in words', () => {
  it.each([
    ['chatgpt', chatgptConfig],
    ['gemini', geminiConfig],
  ])('%s reports quota signals as unavailable, never 0%%', (_name, config) => {
    setBody('A conversation with some text in it.'.repeat(20));
    const adapter = createSiteAdapter(config, deps('https://example.com/c/1'));
    const readings = adapter.getReadings();

    for (const key of ['session', 'weekly', 'credits'] as const) {
      const reading = readings.find((r) => r.key === key);
      expect(reading?.percent).toBeNull();
      expect(reading?.provenance).toBe('unavailable');
      expect(reading?.primary).toBe('Not available on this site');
      expect(hasValue(reading!)).toBe(false);
    }
  });

  it('still produces a context estimate labelled as an estimate', () => {
    setBody('x'.repeat(3800));
    const adapter = createSiteAdapter(chatgptConfig, deps('https://chatgpt.com/'));
    const context = adapter.getReadings().find((r) => r.key === 'context');

    expect(context?.provenance).toBe('dom-estimate');
    expect(context?.primary).toContain('est.');
    // 3800 chars / 3.8 chars-per-token = 1000 tokens.
    expect(context?.primary).toContain('1,000');
    expect(context?.secondary).toMatch(/at least/i);
  });
});

describe('claude usage page (tier 2)', () => {
  it('reads the meters when on /settings/usage', () => {
    setBody(fixture('usage-page.txt'));
    const adapter = createSiteAdapter(claudeConfig, deps('https://claude.ai/settings/usage'));
    void adapter.init();

    const readings = adapter.getReadings();
    expect(readings.find((r) => r.key === 'session')).toMatchObject({
      percent: 18,
      provenance: 'usage-page',
    });
    expect(readings.find((r) => r.key === 'weekly')?.percent).toBe(12);
    expect(readings.find((r) => r.key === 'credits')?.percent).toBe(79);
    adapter.dispose();
  });

  it('ignores the usage page when the URL is a different path', () => {
    setBody(fixture('usage-page.txt'));
    const adapter = createSiteAdapter(claudeConfig, deps('https://claude.ai/chat/abc'));
    void adapter.init();

    expect(adapter.getReadings().find((r) => r.key === 'session')?.provenance).toBe('unavailable');
    adapter.dispose();
  });

  it('refuses to cache the error state', () => {
    setBody(fixture('usage-page-error.txt'));
    const adapter = createSiteAdapter(claudeConfig, deps('https://claude.ai/settings/usage'));
    void adapter.init();

    const session = adapter.getReadings().find((r) => r.key === 'session');
    expect(session?.percent).toBeNull();
    expect(session?.provenance).toBe('unavailable');
    adapter.dispose();
  });

  it('keeps a good reading rather than replacing it with an error state', () => {
    // The page intermittently fails. A transient failure must not wipe a number the
    // user could still reasonably see; it goes stale instead.
    setBody(fixture('usage-page.txt'));
    const adapter = createSiteAdapter(claudeConfig, deps('https://claude.ai/settings/usage'));
    void adapter.init();
    expect(adapter.getReadings().find((r) => r.key === 'session')?.percent).toBe(18);

    setBody(fixture('usage-page-error.txt'));
    void adapter.init();
    expect(adapter.getReadings().find((r) => r.key === 'session')?.percent).toBe(18);
    adapter.dispose();
  });
});

describe('limit warnings', () => {
  it('produces no warning row when no warning is on the page', () => {
    setBody('An ordinary conversation.');
    const adapter = createSiteAdapter(chatgptConfig, deps('https://chatgpt.com/'));
    // Absence of a warning is information, not an unavailable signal — so it gets no
    // bar at all rather than a row reading "not available".
    expect(adapter.getReadings().some((r) => r.key === 'warning')).toBe(false);
  });

  it('reports the matched text when a warning is present', () => {
    setBody('You have reached your message limit for this session.');
    const adapter = createSiteAdapter(chatgptConfig, deps('https://chatgpt.com/'));
    const warning = adapter.getReadings().find((r) => r.key === 'warning');

    expect(warning?.percent).toBeNull();
    expect(warning?.secondary).toContain('reached your message limit');
  });
});

describe('selfTest explains what is and is not working', () => {
  it('states plainly that no API endpoint is implemented', async () => {
    setBody('hello');
    const adapter = createSiteAdapter(claudeConfig, deps('https://claude.ai/'));
    const results = await adapter.selfTest();
    const api = results.find((r) => r.strategy === 'api-endpoint');

    expect(api?.ok).toBe(false);
    expect(api?.detail).toMatch(/no endpoint verified/i);
  });

  it('reports at least two independent strategies per target', async () => {
    setBody('hello');
    const adapter = createSiteAdapter(geminiConfig, deps('https://gemini.google.com/'));
    const results = await adapter.selfTest();

    expect(
      results.filter((r) => r.strategy.startsWith('landmark') || r.strategy.startsWith('role'))
        .length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('never throws into the host page', () => {
  it('survives an empty document and reports everything as unknown', () => {
    document.body.innerHTML = '';
    const adapter = createSiteAdapter(claudeConfig, deps('https://claude.ai/'));

    expect(() => adapter.getReadings()).not.toThrow();
    for (const reading of adapter.getReadings()) {
      expect(reading.percent).toBeNull();
    }
  });

  it('contains a throwing update listener', () => {
    setBody('hello');
    const adapter = createSiteAdapter(claudeConfig, deps('https://claude.ai/'));
    adapter.onUpdate(() => {
      throw new Error('listener blew up');
    });
    void adapter.init();

    expect(() => document.body.appendChild(document.createElement('div'))).not.toThrow();
    adapter.dispose();
  });
});
