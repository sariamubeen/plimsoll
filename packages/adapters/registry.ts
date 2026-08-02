/**
 * Site lookup and the single source of truth for host permissions.
 *
 * The manifest's host permissions are generated from `HOST_PERMISSIONS` below, so the
 * set of sites Plimsoll can touch is declared once. That makes "no <all_urls>, no
 * permission for later" a property of the code rather than a promise in a README.
 */

import type { SiteId } from '@plimsoll/core/types';
import { chatgptConfig } from './chatgpt/index.ts';
import { claudeConfig } from './claude/index.ts';
import { geminiConfig } from './gemini/index.ts';
import { createSiteAdapter, type AdapterDeps, type SiteConfig } from './site-adapter.ts';
import type { SiteAdapter } from './base.ts';

export const SITE_CONFIGS: readonly SiteConfig[] = [claudeConfig, chatgptConfig, geminiConfig];

/**
 * Exactly the three sites in the capability matrix. Narrow by construction — adding
 * one means editing this list, which is a reviewable diff.
 */
export const HOST_PERMISSIONS: readonly string[] = [
  'https://claude.ai/*',
  'https://chatgpt.com/*',
  'https://gemini.google.com/*',
];

export function configForHost(hostname: string): SiteConfig | null {
  return SITE_CONFIGS.find((config) => config.hostPattern.test(hostname)) ?? null;
}

export function configForId(id: SiteId): SiteConfig | null {
  return SITE_CONFIGS.find((config) => config.id === id) ?? null;
}

/** Returns null on any other host — Plimsoll simply does nothing there. */
export function adapterForHost(hostname: string, deps: AdapterDeps): SiteAdapter | null {
  const config = configForHost(hostname);
  return config === null ? null : createSiteAdapter(config, deps);
}

/** Capability matrix as data, for the options page and the docs. */
export function capabilityMatrix(): Record<SiteId, SiteConfig['capabilities']> {
  return Object.fromEntries(SITE_CONFIGS.map((c) => [c.id, c.capabilities])) as Record<
    SiteId,
    SiteConfig['capabilities']
  >;
}
