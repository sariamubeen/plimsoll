/**
 * chatgpt.com — context estimate only.
 *
 * PROMPT §1 marked session/weekly/credits as ❓ pending discovery. Phase 0A found no
 * primary source: OpenAI publishes no consumer usage/quota API and no in-product
 * usage meter equivalent to Claude's /settings/usage (discovery/research.md §3), and
 * no live capture exists to contradict that.
 *
 * So those signals are declared UNAVAILABLE. The panel will say "not available on
 * this site" in words. It will not show an empty bar, which a user reasonably reads
 * as "0% used".
 *
 * Promoting any of them needs one thing: a capture. See docs/capture-protocol.md.
 */

import { COMMON_WARNING_PATTERNS, modelNameStrategies } from '../surface.ts';
import type { SiteConfig } from '../site-adapter.ts';

const MODEL_PATTERN = /\bGPT[-\s]?[\w.]{1,10}/i;

export const chatgptConfig: SiteConfig = {
  id: 'chatgpt',
  hostPattern: /(^|\.)chatgpt\.com$/i,
  capabilities: {
    context: true,
    session: false,
    weekly: false,
    credits: false,
    warning: true,
  },
  modelStrategies: (doc) => modelNameStrategies(doc, MODEL_PATTERN),
  warningPatterns: COMMON_WARNING_PATTERNS,
};
