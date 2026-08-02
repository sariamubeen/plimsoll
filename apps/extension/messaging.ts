/** The message contract between popup, content script and background. */

import type { SiteId, UsageReading } from '@plimsoll/core/types';
import type { SelfTestResult } from '@plimsoll/adapters/base';

export interface PanelState {
  readonly site: SiteId;
  readonly readings: readonly UsageReading[];
  readonly lastUpdatedAt: number | null;
  readonly modelName: string | null;
}

export type Request =
  | { readonly type: 'plimsoll:get-state' }
  | { readonly type: 'plimsoll:refresh' }
  | { readonly type: 'plimsoll:self-test' }
  | { readonly type: 'plimsoll:badge'; readonly percent: number | null };

export type Response =
  | { readonly ok: true; readonly state: PanelState }
  | { readonly ok: true; readonly results: readonly SelfTestResult[] }
  | { readonly ok: false; readonly reason: string };

declare global {
  // Injected by Vite at build time from PLIMSOLL_TARGET.
  const __PLIMSOLL_TARGET__: 'monitor' | 'full';
  const __PLIMSOLL_FULL__: boolean;
}
