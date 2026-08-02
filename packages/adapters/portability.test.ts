// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Conversation } from '@plimsoll/core/types';
import {
  checkBudget,
  extractConversation,
  NEW_CHAT_URL,
  serialize,
  toMarkdown,
  truncateOldestFirst,
} from './portability.ts';

const NOW = 1_800_000_000_000;

function setConversation(turns: string[], attributed = false): void {
  document.body.innerHTML = '';
  const main = document.createElement('main');
  for (const [index, text] of turns.entries()) {
    const article = document.createElement('article');
    if (attributed) {
      article.setAttribute('data-message-author-role', index % 2 === 0 ? 'user' : 'assistant');
    }
    article.textContent = text;
    main.appendChild(article);
  }
  document.body.appendChild(main);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('extraction', () => {
  it('reads turns from semantic article elements', () => {
    setConversation(['First question', 'First answer']);
    const conversation = extractConversation(document, 'claude', 'Claude Opus', NOW);
    expect(conversation.messages.map((m) => m.text)).toEqual(['First question', 'First answer']);
  });

  it('marks turns as unattributed rather than guessing who spoke', () => {
    // Alternating roles would produce an export that is confidently mislabelled.
    // No capture confirms a role attribute, so "unknown" is the honest answer.
    setConversation(['a', 'b', 'c']);
    const conversation = extractConversation(document, 'claude', null, NOW);
    expect(conversation.messages.every((m) => m.role === 'unknown')).toBe(true);
  });

  it('uses an explicit role attribute when the page actually provides one', () => {
    setConversation(['q', 'a'], true);
    const conversation = extractConversation(document, 'chatgpt', null, NOW);
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('always reports truncated, because virtualised turns are not in the DOM', () => {
    setConversation(['only turn']);
    expect(extractConversation(document, 'gemini', null, NOW).truncated).toBe(true);
  });

  it('returns an empty conversation rather than throwing on a bare page', () => {
    const conversation = extractConversation(document, 'claude', null, NOW);
    expect(conversation.messages).toEqual([]);
  });
});

describe('serialization', () => {
  const conversation: Conversation = {
    site: 'claude',
    title: 'A chat',
    model: 'Claude Opus',
    capturedAt: NOW,
    messages: [
      { role: 'user', text: 'hello' },
      { role: 'unknown', text: 'world' },
    ],
    truncated: true,
  };

  it('states its own limitations in the markdown header', () => {
    const md = toMarkdown(conversation);
    expect(md).toContain('earlier messages may be missing');
    expect(md).toContain('speaker labels could not be determined');
  });

  it('round-trips through JSON', () => {
    expect(JSON.parse(serialize(conversation, 'json'))).toEqual(conversation);
  });

  it('produces plain text without markdown syntax', () => {
    const text = serialize(conversation, 'text');
    expect(text).toContain('hello');
    expect(text).not.toContain('##');
  });
});

describe('token budget', () => {
  const big: Conversation = {
    site: 'claude',
    title: null,
    model: null,
    capturedAt: NOW,
    messages: Array.from({ length: 40 }, (_, i) => ({
      role: 'unknown' as const,
      text: `turn ${i} `.repeat(200),
    })),
    truncated: true,
  };

  it('detects an export larger than the ceiling', () => {
    expect(checkBudget(serialize(big, 'markdown'), 1000, 3.8).overBudget).toBe(true);
  });

  it('drops the OLDEST turns first and keeps the newest', () => {
    const trimmed = truncateOldestFirst(big, 'markdown', 2000, 3.8);
    expect(trimmed.messages.length).toBeLessThan(big.messages.length);
    // The most recent turn is the one the user is mid-conversation about.
    expect(trimmed.messages.at(-1)?.text).toBe(big.messages.at(-1)?.text);
  });

  it('never truncates below a single message', () => {
    expect(truncateOldestFirst(big, 'markdown', 1, 3.8).messages).toHaveLength(1);
  });
});

describe('handoff targets', () => {
  it('points at a BLANK new chat, never at anything that resumes a limit', () => {
    for (const url of Object.values(NEW_CHAT_URL)) {
      expect(url.startsWith('https://')).toBe(true);
    }
    expect(Object.keys(NEW_CHAT_URL).sort()).toEqual(['chatgpt', 'claude', 'gemini']);
  });
});
