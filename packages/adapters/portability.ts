/**
 * Conversation portability — `full` build only, tree-shaken out of `monitor`.
 *
 * Framing matters here, and it is a compliance boundary, not a style choice. This is
 * DATA PORTABILITY: your conversation is your data, so take it with you. It is always
 * user-initiated, one conversation at a time, never automatic, and it is never
 * surfaced in response to a limit warning — that adjacency is exactly what the Chrome
 * Web Store policy of 1 August 2026 prohibits (PROMPT §2.1).
 *
 * Nothing here helps anyone continue past a limit.
 */

import type { Conversation, ConversationMessage, SiteId } from '@plimsoll/core/types';
import { estimateTokens } from '@plimsoll/core/tokens';
import { runStrategies, type Strategy } from './base.ts';
import { conversationStrategies, elementText } from './surface.ts';

export type ExportFormat = 'markdown' | 'json' | 'text';

/**
 * Splits the conversation surface into turns using SEMANTIC structure only.
 *
 * No site-specific attribute is used, because no capture exists to confirm one. That
 * means roles usually cannot be determined, and turns come back as `unknown` rather
 * than being alternated on a guess.
 */
function turnStrategies(surface: Element): Strategy<Element[]>[] {
  const nonEmpty = (nodes: Element[]) => {
    const kept = nodes.filter((node) => elementText(node).trim().length > 0);
    return kept.length > 0 ? kept : null;
  };

  return [
    { name: 'article-elements', fn: () => nonEmpty([...surface.querySelectorAll('article')]) },
    {
      name: 'listitem-roles',
      fn: () => nonEmpty([...surface.querySelectorAll('[role="listitem"]')]),
    },
    {
      name: 'direct-children',
      fn: () =>
        nonEmpty([...surface.children].filter((child) => elementText(child).trim().length > 40)),
    },
  ];
}

/**
 * Reads a role from an explicit ARIA/semantic hint, or returns 'unknown'.
 * Deliberately conservative — a wrong label is worse than an honest absence.
 */
function roleOf(node: Element): ConversationMessage['role'] {
  const hint = (
    node.getAttribute('data-message-author-role') ??
    node.getAttribute('aria-label') ??
    ''
  ).toLowerCase();
  if (hint.includes('user') || hint.startsWith('you')) return 'user';
  if (hint.includes('assistant') || hint.includes('model')) return 'assistant';
  return 'unknown';
}

export function extractConversation(
  doc: Document,
  site: SiteId,
  model: string | null,
  capturedAt: number,
): Conversation {
  const surface = runStrategies(conversationStrategies(doc))?.value ?? null;
  if (surface === null) {
    return { site, title: null, model, capturedAt, messages: [], truncated: true };
  }

  const turns = runStrategies(turnStrategies(surface))?.value ?? [];
  const messages: ConversationMessage[] = turns.map((node) => ({
    role: roleOf(node),
    text: elementText(node).trim(),
  }));

  return {
    site,
    title: doc.title.trim().length > 0 ? doc.title.trim() : null,
    model,
    capturedAt,
    messages,
    // Always true: these apps virtualise long threads, so offscreen turns are simply
    // not in the DOM to extract. Saying otherwise would overstate what was captured.
    truncated: true,
  };
}

const ROLE_LABEL: Record<ConversationMessage['role'], string> = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
  unknown: 'Unattributed',
};

export function toMarkdown(conversation: Conversation): string {
  const header = [
    `# ${conversation.title ?? 'Conversation'}`,
    '',
    `- Source: ${conversation.site}`,
    `- Model: ${conversation.model ?? 'unknown'}`,
    `- Exported: ${new Date(conversation.capturedAt).toISOString()}`,
    conversation.truncated
      ? '- Note: only the turns present on the page were exported. Long conversations are virtualised, so earlier messages may be missing.'
      : null,
    conversation.messages.some((m) => m.role === 'unknown')
      ? '- Note: speaker labels could not be determined for some turns and are marked Unattributed.'
      : null,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const body = conversation.messages
    .map((message) => `## ${ROLE_LABEL[message.role]}\n\n${message.text}\n`)
    .join('\n');

  return `${header}\n${body}`;
}

export function toPlainText(conversation: Conversation): string {
  return conversation.messages
    .map((message) => `${ROLE_LABEL[message.role]}:\n${message.text}`)
    .join('\n\n---\n\n');
}

export function serialize(conversation: Conversation, format: ExportFormat): string {
  if (format === 'json') return JSON.stringify(conversation, null, 2);
  if (format === 'text') return toPlainText(conversation);
  return toMarkdown(conversation);
}

export interface BudgetCheck {
  readonly tokens: number;
  readonly ceiling: number;
  readonly overBudget: boolean;
}

/** Estimates whether an export fits the target's context ceiling. */
export function checkBudget(text: string, ceiling: number, charsPerToken: number): BudgetCheck {
  const tokens = estimateTokens(text, charsPerToken);
  return { tokens, ceiling, overBudget: tokens > ceiling };
}

/**
 * Drops the OLDEST turns until the export fits.
 *
 * Truncation is mechanical and local. Summarising with an LLM would mean sending the
 * conversation to a third party, which PROMPT §2.3 forbids outright — Plimsoll makes
 * no network call other than to the provider the user is already signed into.
 */
export function truncateOldestFirst(
  conversation: Conversation,
  format: ExportFormat,
  ceiling: number,
  charsPerToken: number,
): Conversation {
  let messages = [...conversation.messages];
  while (messages.length > 1) {
    const candidate = { ...conversation, messages };
    if (!checkBudget(serialize(candidate, format), ceiling, charsPerToken).overBudget) break;
    messages = messages.slice(1);
  }
  return { ...conversation, messages };
}

/** New-chat URLs for handoff. The user is taken to a blank chat; nothing is sent. */
export const NEW_CHAT_URL: Record<SiteId, string> = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
};
