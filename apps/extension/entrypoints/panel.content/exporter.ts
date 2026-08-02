/**
 * Export controls — reachable ONLY from the `full` build.
 *
 * This module is loaded via a dynamic import inside an `if (__PLIMSOLL_FULL__)`
 * branch. With the constant defined as `false`, the branch folds at build time and
 * this chunk is never emitted, so `monitor` ships zero portability code rather than
 * shipping it disabled (PROMPT §2.2, §11.10).
 *
 * Deliberately built as plain DOM rather than React: it is a rarely-used control, and
 * keeping it out of the panel's component tree means the monitor build has no
 * reference to it at all.
 */

import type { SiteAdapter } from '@plimsoll/adapters/base';
import {
  checkBudget,
  extractConversation,
  NEW_CHAT_URL,
  serialize,
  truncateOldestFirst,
  type ExportFormat,
} from '@plimsoll/adapters/portability';
import { DEFAULT_CHARS_PER_TOKEN, DEFAULT_CONTEXT_CEILING } from '@plimsoll/core/tokens';
import type { PlimsollStorage } from '@plimsoll/core/storage';

const DISCLOSURE_KEY = 'plimsoll:portability-disclosed';

/**
 * Shown once, before anything ever leaves the page. States exactly what is copied and
 * where it goes, which is what the tightened disclosure policy requires.
 */
function disclosureText(): string {
  return [
    'Export this conversation?',
    '',
    'Plimsoll will read the messages currently on this page and put them where you choose:',
    '  • your clipboard, or',
    '  • a file you download.',
    '',
    'Nothing is sent to Plimsoll. Plimsoll has no server and makes no third-party requests.',
    'Only the turns visible on the page can be exported — long conversations are',
    'virtualised, so earlier messages may be missing.',
  ].join('\n');
}

async function alreadyDisclosed(storage: PlimsollStorage): Promise<boolean> {
  const data = await storage.exportAll();
  return Boolean((data.settings as unknown as Record<string, unknown>)[DISCLOSURE_KEY]);
}

function download(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ExportOptions {
  readonly adapter: SiteAdapter;
  readonly storage: PlimsollStorage;
  readonly container: HTMLElement;
  readonly doc: Document;
}

export function mountExportControls({ adapter, storage, container, doc }: ExportOptions): void {
  const wrapper = doc.createElement('div');
  wrapper.className = 'footer';

  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = 'Export conversation';
  button.setAttribute('aria-label', 'Export this conversation as a file or to the clipboard');

  const status = doc.createElement('span');
  status.className = 'row__note';

  button.addEventListener('click', () => {
    void (async () => {
      try {
        if (!(await alreadyDisclosed(storage))) {
          // One-time, explicit disclosure before any data leaves the page. A silent
          // export would breach §6.2 regardless of how convenient it feels.
          if (!doc.defaultView?.confirm(disclosureText())) return;
          await storage.setSettings({ [DISCLOSURE_KEY]: true } as never);
        }

        const conversation = extractConversation(
          doc,
          adapter.id,
          adapter.getModelName(),
          Date.now(),
        );
        if (conversation.messages.length === 0) {
          status.textContent = 'Nothing to export — no messages found on this page.';
          return;
        }

        const format: ExportFormat = 'markdown';
        let text = serialize(conversation, format);

        const budget = checkBudget(text, DEFAULT_CONTEXT_CEILING, DEFAULT_CHARS_PER_TOKEN);
        if (budget.overBudget) {
          const trimmed = truncateOldestFirst(
            conversation,
            format,
            DEFAULT_CONTEXT_CEILING,
            DEFAULT_CHARS_PER_TOKEN,
          );
          const dropped = conversation.messages.length - trimmed.messages.length;
          // Warn and truncate oldest-first. Summarising would mean sending the
          // conversation to a third party, which is forbidden outright. The user must
          // consent before any turns are dropped.
          if (
            !doc.defaultView?.confirm(
              `This export is larger than a typical context window.\n\nDrop the ${dropped} oldest message(s)?`,
            )
          ) {
            return;
          }
          text = serialize(trimmed, format);
        }

        await navigator.clipboard.writeText(text).catch(() => {
          download(`plimsoll-${adapter.id}-conversation.md`, text);
        });
        status.textContent = 'Copied. Your conversation is yours to take anywhere.';
      } catch {
        status.textContent = 'Could not export this conversation.';
      }
    })();
  });

  wrapper.append(button, status);
  container.appendChild(wrapper);
}

/** Opens a blank chat on another provider. Explicit user action only. */
export function openHandoff(site: keyof typeof NEW_CHAT_URL): void {
  // chrome.tabs.create works without the "tabs" permission.
  window.open(NEW_CHAT_URL[site], '_blank', 'noopener');
}
