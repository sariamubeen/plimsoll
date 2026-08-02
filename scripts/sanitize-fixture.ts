/**
 * Reads real captures from fixtures/raw/ and writes structurally identical,
 * synthetic-valued copies into fixtures/sanitized/ (PROMPT §2.4).
 *
 *   pnpm run sanitize                 # everything under fixtures/raw/
 *   pnpm run sanitize claude          # just fixtures/raw/claude/
 *
 * fixtures/raw/ is gitignored and must stay that way. This script only ever reads
 * from it and only ever writes to fixtures/sanitized/.
 *
 * Structure is preserved on purpose: same JSON keys, same line count, same string
 * lengths. A parser that works on the sanitized fixture works on the real page.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN_HEADERS, findPii, scrub, SYNTHETIC_NAME } from './pii-patterns.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(REPO_ROOT, 'fixtures', 'raw');
const SANITIZED_DIR = join(REPO_ROOT, 'fixtures', 'sanitized');

const LOREM =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud ';

/** Free-text values replaced with lorem of identical length. */
const FREE_TEXT_KEYS =
  /^(?:title|name|summary|content|text|body|prompt|message|description|label)$/i;

/** Values replaced with a fixed synthetic human name. */
const PERSON_NAME_KEYS =
  /^(?:full_name|display_name|first_name|last_name|given_name|family_name|nickname)$/i;

/**
 * Lorem text of exactly `length` characters, so downstream length-based token
 * estimation behaves the same on the sanitized fixture as on the real capture.
 */
export function loremOfLength(length: number): string {
  if (length <= 0) return '';
  const repeated = LOREM.repeat(Math.ceil(length / LOREM.length));
  return repeated.slice(0, length);
}

/** Recursively sanitizes a parsed JSON value, key-aware. */
export function sanitizeJsonValue(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    if (key !== undefined && PERSON_NAME_KEYS.test(key)) return SYNTHETIC_NAME;
    if (key !== undefined && FREE_TEXT_KEYS.test(key)) return loremOfLength(value.length);
    return scrub(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Credential-bearing headers are dropped entirely rather than replaced --
      // there is no synthetic value for these that is worth keeping.
      if (FORBIDDEN_HEADERS.includes(k.toLowerCase())) continue;
      out[k] = sanitizeJsonValue(v, k);
    }
    return out;
  }
  // Numbers and booleans carry no identity on their own and are left intact so
  // percentages, timestamps and limits stay realistic for parser tests.
  return value;
}

function sanitizeJsonFile(source: string): string {
  const parsed: unknown = JSON.parse(source);
  return `${JSON.stringify(sanitizeJsonValue(parsed), null, 2)}\n`;
}

/**
 * Text captures (for example `document.body.innerText` on the usage page) cannot be
 * scrubbed key-aware, so regex rules are all that apply automatically. Anything the
 * meter grammar does not recognise is reported for human review before commit.
 */
const METER_GRAMMAR = [
  /^\s*$/,
  /resets/i,
  /\d+%/,
  /used/i,
  /limit/i,
  /balance/i,
  /credit/i,
  /spent/i,
  /session/i,
  /models?$/i,
  /unable to load/i,
  /^[$£€¥]/,
];

function sanitizeTextFile(source: string): { output: string; unreviewed: string[] } {
  const scrubbed = scrub(source);
  const unreviewed = scrubbed
    .split(/\r?\n/)
    .filter((line) => !METER_GRAMMAR.some((re) => re.test(line)));
  return { output: scrubbed, unreviewed };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function main(): void {
  const filter = process.argv[2];

  if (!existsSync(RAW_DIR)) {
    console.error(`No fixtures/raw/ directory. Nothing to sanitize.`);
    console.error(`Save captures to fixtures/raw/<site>/ first -- see docs/capture-protocol.md.`);
    process.exit(1);
  }

  const files = walk(RAW_DIR).filter((f) => (filter ? f.includes(filter) : true));
  if (files.length === 0) {
    console.error(`No files under fixtures/raw/${filter ?? ''}.`);
    process.exit(1);
  }

  let needsReview = 0;

  for (const file of files) {
    const rel = relative(RAW_DIR, file);
    const dest = join(SANITIZED_DIR, rel);
    const source = readFileSync(file, 'utf8');

    let output: string;
    let unreviewed: string[] = [];
    if (file.endsWith('.json')) {
      output = sanitizeJsonFile(source);
    } else {
      ({ output, unreviewed } = sanitizeTextFile(source));
    }

    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, output, 'utf8');

    // Self-check: the sanitizer must not emit anything the privacy test would fail on.
    const residual = findPii(output);
    const status = residual.length === 0 ? 'ok' : `${residual.length} RESIDUAL`;
    console.log(`  ${rel} -> fixtures/sanitized/${rel} [${status}]`);
    for (const hit of residual) {
      console.error(`    !! ${hit.ruleId} still present at offset ${hit.index}`);
    }
    if (residual.length > 0) process.exitCode = 1;

    if (unreviewed.length > 0) {
      needsReview += unreviewed.length;
      console.warn(
        `    ${unreviewed.length} line(s) not recognised as meter text -- review before committing:`,
      );
      for (const line of unreviewed.slice(0, 20)) {
        console.warn(`      | ${line.slice(0, 100)}`);
      }
      if (unreviewed.length > 20) console.warn(`      ... and ${unreviewed.length - 20} more`);
    }
  }

  console.log(`\nSanitized ${files.length} file(s).`);
  if (needsReview > 0) {
    console.warn(
      `\n${needsReview} line(s) need a human read. Regex rules cannot identify a\n` +
        `conversation title or a person's name in free text -- only you can. Read the\n` +
        `sanitized file before committing it.`,
    );
  }
}

// Only run when invoked directly, so the unit tests can import the helpers above.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
