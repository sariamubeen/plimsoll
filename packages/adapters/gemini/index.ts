/**
 * gemini.google.com — context estimate only.
 *
 * Same position as ChatGPT: Phase 0A found no primary source for a Gemini usage or
 * quota readout (discovery/research.md §3), and no live capture exists. Those signals
 * are therefore declared unavailable and say so in words rather than rendering a bar
 * that implies zero usage.
 */

import { COMMON_WARNING_PATTERNS, modelNameStrategies } from '../surface.ts';
import type { SiteConfig } from '../site-adapter.ts';

const MODEL_PATTERN = /\bGemini\s+[\w.]{1,8}(?:\s+(?:Pro|Flash|Ultra|Nano))?/i;

export const geminiConfig: SiteConfig = {
  id: 'gemini',
  hostPattern: /(^|\.)gemini\.google\.com$/i,
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
