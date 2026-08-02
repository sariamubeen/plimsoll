import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPii } from '../scripts/pii-patterns.ts';

/**
 * Fails CI if personally identifying data reaches a committed file.
 *
 * This repo is public and Phase 0 deliberately captures real spend, balance, org
 * UUIDs and conversation titles. Committing one of those and deleting it in a later
 * commit does not remove it -- the data stays in history. This test is the gate that
 * stops it reaching history in the first place (PROMPT §2.4).
 *
 * Scope is deliberately limited to COMMITTED directories. fixtures/raw/ is gitignored
 * and is expected to be full of real data on a developer's machine; scanning it would
 * make the suite permanently red and train everyone to ignore the failure.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SCANNED_DIRS = ['fixtures/sanitized', 'docs', 'discovery', 'site'];
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|pdf)$/i;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

describe('no PII in committed files', () => {
  const files = SCANNED_DIRS.flatMap((d) => walk(join(REPO_ROOT, d))).filter(
    (f) => !BINARY.test(f),
  );

  it('scans the directories that hold captured data', () => {
    // Guards against the scan silently covering nothing -- for example if a
    // directory is renamed and SCANNED_DIRS is not updated. A green test over zero
    // files is the most dangerous outcome here, so assert the paths still exist.
    const present = SCANNED_DIRS.filter((d) => existsSync(join(REPO_ROOT, d)));
    expect(present.length, `none of ${SCANNED_DIRS.join(', ')} exist`).toBeGreaterThan(0);
  });

  it.each(files.length > 0 ? files : [null])('%s is free of PII', (file) => {
    if (file === null) return; // No committed capture files yet; nothing to scan.
    const hits = findPii(readFileSync(file, 'utf8'));
    const report = hits
      .slice(0, 10)
      .map((h) => `  ${h.ruleId} at offset ${h.index}: ${h.match.slice(0, 24)}...`)
      .join('\n');
    expect(hits, `${relative(REPO_ROOT, file)} contains PII:\n${report}`).toEqual([]);
  });
});

describe('raw captures are excluded from git', () => {
  it('gitignores fixtures/raw/', () => {
    const ignored = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(ignored).toMatch(/^fixtures\/raw\/$/m);
  });

  it('has never tracked a file under fixtures/raw/', () => {
    // The authoritative check. .gitignore can be bypassed with `git add -f`, so ask
    // git itself what it is actually tracking rather than trusting the ignore file.
    expect(git('ls-files', 'fixtures/raw')).toBe('');
  });

  it('has no raw capture anywhere in history', () => {
    const everTracked = git('log', '--all', '--pretty=format:', '--name-only', '--diff-filter=A')
      .split('\n')
      .filter((p) => p.startsWith('fixtures/raw/'));
    expect(
      everTracked,
      'a raw capture exists in git history — rewrite with git-filter-repo',
    ).toEqual([]);
  });
});
