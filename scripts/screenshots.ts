/**
 * Generates Chrome Web Store screenshots from SANITIZED fixture pages.
 *
 *   pnpm run screenshots
 *
 * Never point this at a live account. Store screenshots are public forever, and a live
 * usage page shows real spend, real balance, and the sidebar full of real conversation
 * titles. That is why the generation script is committed and the images are produced
 * from fixtures instead of captured by hand.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_PATH = join(REPO_ROOT, 'apps', 'extension', '.output', 'chrome-mv3');
const FIXTURE_PAGES = join(REPO_ROOT, 'fixtures', 'sanitized', 'pages');
const OUT_DIR = join(REPO_ROOT, 'screenshots', 'store');

const VIEWPORT = { width: 1280, height: 800 };

interface Shot {
  readonly name: string;
  readonly page: string;
  readonly description: string;
}

const SHOTS: readonly Shot[] = [
  {
    name: '01-usage-meters',
    page: 'claude-usage.html',
    description: 'Session, weekly and credit meters with reset times',
  },
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: VIEWPORT,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  try {
    for (const shot of SHOTS) {
      const page = await context.newPage();
      await page.setViewportSize(VIEWPORT);
      await page.goto(`file://${join(FIXTURE_PAGES, shot.page).replace(/\\/g, '/')}`);
      await page.waitForTimeout(1500);

      const file = join(OUT_DIR, `${shot.name}.png`);
      await page.screenshot({ path: file });
      console.log(`✔ ${shot.name} — ${shot.description}`);
      await page.close();
    }
  } finally {
    await context.close();
  }

  console.log(`\nWrote ${SHOTS.length} screenshot(s) to screenshots/store/.`);
  console.log('Review each one before uploading. The fixtures are synthetic, but look anyway.');
}

void main();
