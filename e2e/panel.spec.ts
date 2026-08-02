import { expect, test } from '@playwright/test';
import { fixtureUrl, launchWithExtension } from './fixtures.ts';

/**
 * End-to-end against the built extension and a sanitized fixture page.
 *
 * The unit tests prove the parser and the components behave. These prove the assembled
 * extension actually injects, renders, and — most importantly — never puts a fabricated
 * number in front of a user.
 */

test('panel injects and renders readings without breaking the host page', async () => {
  const context = await launchWithExtension();
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(fixtureUrl('claude-usage.html'));
    await page.waitForTimeout(1500);

    // Shadow DOM host is present.
    const host = page.locator('plimsoll-panel');
    await expect(host).toHaveCount(1);

    const panel = host.locator('section[aria-label="Plimsoll usage"]');
    await expect(panel).toBeVisible();

    // A content script must never throw into the host page.
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('no bar ever displays a fabricated 0%', async () => {
  const context = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto(fixtureUrl('claude-usage.html'));
    await page.waitForTimeout(1500);

    const meters = page.locator('plimsoll-panel [role="meter"]');
    const count = await meters.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const meter = meters.nth(i);
      const valueNow = await meter.getAttribute('aria-valuenow');
      const valueText = await meter.getAttribute('aria-valuetext');

      if (valueNow === null) {
        // Unknown: must say so in words, and must render the hatched track.
        expect(valueText).toBe('not available');
        await expect(meter).toHaveClass(/gauge--unknown/);
      } else {
        // Known: a real reading, never a placeholder zero standing in for unknown.
        expect(Number(valueNow)).toBeGreaterThan(0);
      }
    }
  } finally {
    await context.close();
  }
});

test('settings persist across a reload', async () => {
  const context = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto(fixtureUrl('claude-usage.html'));
    await page.waitForTimeout(1500);

    const collapse = page.locator('plimsoll-panel button[aria-label="Collapse usage panel"]');
    await collapse.click();

    await page.reload();
    await page.waitForTimeout(1500);

    await expect(
      page.locator('plimsoll-panel button[aria-label="Expand usage panel"]'),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
