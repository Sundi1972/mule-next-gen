import { BRAIN } from '@mule/engine';
import type { ShortOption } from '../decider.js';

/** What a model's reply came to: the option and line it chose, or why it cannot be used. */
export type ParsedReply = { ok: true; optionId: string; line: string | null } | { ok: false; reason: string };

const QUOTE_MARKS = '"\'“”‘’';

const NOTE_NAME_CHARS = 8;

function isQuote(char: string | undefined): boolean {
  return char !== undefined && QUOTE_MARKS.includes(char);
}

/** Strips quote marks only while both ends carry one: a lone apostrophe is speech. */
function stripQuotePairs(text: string): string {
  let chars = [...text];
  while (chars.length >= 2 && isQuote(chars[0]) && isQuote(chars[chars.length - 1])) {
    chars = chars.slice(1, -1);
    text = chars.join('').trim();
    chars = [...text];
  }
  return text;
}

function clean(line: unknown): string | null {
  if (typeof line !== 'string') return null;
  const stripped = stripQuotePairs(line.replace(/\s+/g, ' ').trim());
  // Cut by code points: slicing UTF-16 units could leave half an emoji.
  const capped = [...stripped].slice(0, BRAIN.maxLineChars).join('').trim();
  return capped === '' || [...capped].every(isQuote) ? null : capped;
}

/** The model's raw option text as one short line, safe to put in a note. */
function nameForNote(option: string): string {
  return [...option.replace(/\s+/g, ' ').trim()].slice(0, NOTE_NAME_CHARS).join('').trim();
}

/** Reads a model's JSON reply against the shortlist. Never throws. */
export function parseReply(text: string, shortlist: ShortOption[]): ParsedReply {
  const unreadable: ParsedReply = { ok: false, reason: 'unreadable reply' };
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    return unreadable;
  }
  if (typeof reply !== 'object' || reply === null) return unreadable;
  const { option, line } = reply as { option?: unknown; line?: unknown };
  if (typeof option !== 'string') return unreadable;
  if (!shortlist.some((o) => o.id === option)) return { ok: false, reason: `named ${nameForNote(option)}, not on the list` };
  return { ok: true, optionId: option, line: clean(line) };
}
