import { defineConfig } from '@playwright/test';

/**
 * E2E against the built extension and SANITIZED fixture pages.
 *
 * Never against a live account: a real page would put actual spend, balance and
 * conversation titles into test output and screenshots, and those screenshots are the
 * ones that end up on a public store listing.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // The extension is loaded per-test via a persistent context; see e2e/fixtures.ts.
    trace: 'on-first-retry',
  },
});
