import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/`, import.meta.url));

export default defineConfig({
  resolve: {
    // Workspace packages are consumed as source. There is no build step between
    // packages and the extension bundle, so tests exercise exactly what ships.
    alias: [
      { find: /^@plimsoll\/core\/(.*)$/, replacement: `${pkg('core')}$1.ts` },
      { find: /^@plimsoll\/adapters\/(.*)$/, replacement: `${pkg('adapters')}$1.ts` },
      // UI modules are .tsx; the two component entrypoints are listed explicitly so
      // the .ts helpers in the same folder still resolve.
      { find: /^@plimsoll\/ui\/(Bar|Panel)$/, replacement: `${pkg('ui')}$1.tsx` },
      { find: /^@plimsoll\/ui\/(.*)$/, replacement: `${pkg('ui')}$1.ts` },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
