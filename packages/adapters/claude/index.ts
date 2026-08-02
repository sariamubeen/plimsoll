/**
 * claude.ai — the only site with a confirmed tier-2 source.
 *
 * PROMPT §4.2 supplies a real transcription of `/settings/usage`, so the session,
 * weekly and credit meters are backed by evidence and declared available. Tier 1
 * (an authenticated API fetch) is NOT implemented: prior art suggests an endpoint
 * shaped like `/api/organizations/{uuid}/…`, but no capture confirms it, and
 * attempt #3 failed by guessing exactly that kind of URL.
 */

import { elementText, modelNameStrategies, COMMON_WARNING_PATTERNS } from '../surface.ts';
import type { SiteConfig } from '../site-adapter.ts';
import { parseUsagePage, toReadings } from './usage-page.ts';

const MODEL_PATTERN = /\bClaude\s+[\w.]*\s*(?:Opus|Sonnet|Haiku)[\w.\s]{0,12}/i;

export const claudeConfig: SiteConfig = {
  id: 'claude',
  hostPattern: /(^|\.)claude\.ai$/i,
  capabilities: {
    context: true,
    // Backed by the §4.2 usage-page transcription.
    session: true,
    weekly: true,
    credits: true,
    warning: true,
  },
  modelStrategies: (doc) => modelNameStrategies(doc, MODEL_PATTERN),
  warningPatterns: COMMON_WARNING_PATTERNS,
  usagePage: {
    matches: (url) => /\/settings\/usage\/?$/i.test(url.pathname),
    read: (doc, capturedAt) => {
      const parse = parseUsagePage(elementText(doc.body));
      return { readings: toReadings(parse, capturedAt), cacheable: parse.cacheable };
    },
  },
};

export { parseUsagePage, toReadings } from './usage-page.ts';
