import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
export const EXTENSION_PATH = join(REPO_ROOT, 'apps', 'extension', '.output', 'chrome-mv3');
export const FIXTURE_PAGES = join(REPO_ROOT, 'fixtures', 'sanitized', 'pages');

/**
 * Launches Chromium with the built extension loaded.
 *
 * MV3 extensions require a persistent context and a real (headed or new-headless)
 * browser — `--load-extension` is ignored by the old headless mode.
 */
export async function launchWithExtension(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
}

export function fixtureUrl(name: string): string {
  return `file://${join(FIXTURE_PAGES, name).replace(/\\/g, '/')}`;
}
