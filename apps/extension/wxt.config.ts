import { defineConfig } from 'wxt';
import { HOST_PERMISSIONS } from '@plimsoll/adapters/registry';

/**
 * Build target. `monitor` is the lean, obviously-compliant build submitted to the
 * Chrome Web Store first; `full` adds conversation portability.
 *
 * This is a BUILD-TIME flag, not a runtime one. Portability code is tree-shaken out
 * of `monitor` entirely, because dead code in the bundle still counts as shipped code
 * (PROMPT §2.2). CI greps the built bundle to prove it.
 */
const target = process.env.PLIMSOLL_TARGET === 'full' ? 'full' : 'monitor';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: 'Plimsoll',
    description:
      'Read-only usage monitoring for AI chat. Shows context, session and limit usage inline. Never modifies or bypasses any limit.',
    homepage_url: 'https://plimsoll.anubris.com',
    // Minimum permissions. No "tabs" — chrome.tabs.sendMessage and the tab id are
    // both available without it, and it is a classic rejection trigger. No
    // <all_urls>. Nothing requested "for later".
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    permissions: ['storage'],
    host_permissions: [...HOST_PERMISSIONS],
  },
  vite: () => ({
    define: {
      __PLIMSOLL_TARGET__: JSON.stringify(target),
      // Compared against a literal so the bundler can fold the branch away and
      // eliminate the portability modules entirely.
      __PLIMSOLL_FULL__: JSON.stringify(target === 'full'),
    },
  }),
});
