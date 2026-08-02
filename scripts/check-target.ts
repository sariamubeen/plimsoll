/**
 * Proves the `monitor` build contains no portability code, and that neither build
 * requests a permission it should not.
 *
 * "Tree-shaken out" is a claim about a bundler's behaviour, and bundler behaviour
 * changes between versions. The only trustworthy check is to read the bytes that
 * actually ship — so this greps the built output rather than trusting the config.
 *
 *   node scripts/check-target.ts monitor
 *   node scripts/check-target.ts full
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(REPO_ROOT, 'apps', 'extension', '.output', 'chrome-mv3');

/**
 * Strings that must not appear in the monitor bundle.
 *
 * These are function names and user-facing copy from the portability layer. Minifiers
 * mangle local identifiers but not string literals, which is why the copy is included
 * — it survives minification and is therefore the reliable signal.
 */
const PORTABILITY_MARKERS = [
  'Export conversation',
  'Export this conversation',
  'truncateOldestFirst',
  'toMarkdown',
  'NEW_CHAT_URL',
  'Unattributed',
  'your conversation is yours',
];

/** Permissions that must never appear in any build. */
const FORBIDDEN_PERMISSIONS = ['tabs', '<all_urls>', 'webRequest', 'management', 'cookies'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function main(): void {
  const target = process.argv[2];
  if (target !== 'monitor' && target !== 'full') {
    fail('usage: node scripts/check-target.ts <monitor|full>');
  }

  if (!existsSync(OUTPUT_DIR)) {
    fail(`no build output at ${OUTPUT_DIR} — run the build first`);
  }

  const files = walk(OUTPUT_DIR);
  const code = files.filter((f) => f.endsWith('.js'));

  // --- permissions ---------------------------------------------------------
  const manifestPath = join(OUTPUT_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    permissions?: string[];
    host_permissions?: string[];
  };
  const requested = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])];

  for (const forbidden of FORBIDDEN_PERMISSIONS) {
    if (requested.includes(forbidden)) {
      fail(`manifest requests forbidden permission "${forbidden}"`);
    }
  }
  console.log(`✔ permissions clean: ${requested.join(', ')}`);

  // --- portability ---------------------------------------------------------
  const hits: string[] = [];
  for (const file of code) {
    const contents = readFileSync(file, 'utf8');
    for (const marker of PORTABILITY_MARKERS) {
      if (contents.includes(marker)) hits.push(`${marker} in ${file.replace(REPO_ROOT, '')}`);
    }
  }

  if (target === 'monitor') {
    if (hits.length > 0) {
      console.error('Portability code reached the monitor bundle:');
      for (const hit of hits) console.error(`   ${hit}`);
      fail('monitor must not contain portability code — dead code still ships');
    }
    console.log('✔ monitor bundle contains no portability code');
  } else {
    if (hits.length === 0) {
      // Guards the guard: if the markers stop matching, the monitor check above
      // starts passing vacuously and would never catch a real regression.
      fail(
        'full build contains no portability markers — the markers are stale, so the monitor check is now meaningless',
      );
    }
    console.log(`✔ full bundle contains portability code (${hits.length} marker hits)`);
  }

  const bytes = code.reduce((total, file) => total + statSync(file).size, 0);
  console.log(`✔ ${target}: ${code.length} JS files, ${(bytes / 1024).toFixed(1)} kB`);
}

main();
