import { BRAIN } from '@mule/engine';
import type { ShortOption } from '../decider.js';
import { capCodePoints, toOneLine } from '../text.js';

/** Why a reply cannot be used: not readable at all, or naming an option off the list. */
export type RejectOutcome = 'unreadable' | 'off_list';

/** What a model's reply came to: the option and line it chose, or why it cannot be used. */
export type ParsedReply = { ok: true; optionId: string; line: string | null } | { ok: false; outcome: RejectOutcome; reason: string };

const QUOTE_MARKS = '"\'“”‘’';

// Long enough to recognise a stray option letter or word, short enough that the note stays one glance.
// literal-ok: caps a rejected reply's name in its diagnostic note; no effect on play
const NOTE_NAME_CHARS = 8;

function isQuote(char: string | undefined): boolean {
  return char !== undefined && QUOTE_MARKS.includes(char);
}

/** Strips quote marks only while both ends carry one: a lone apostrophe is speech. */
function stripQuotePairs(text: string): string {
  let chars = [...text];
  // literal-ok: a pair of quote marks needs two characters, an opening and a closing one
  while (chars.length >= 2 && isQuote(chars[0]) && isQuote(chars[chars.length - 1])) {
    chars = chars.slice(1, -1);
    text = chars.join('').trim();
    chars = [...text];
  }
  return text;
}

/** A model's table-talk line as one line within BRAIN.maxLineChars, its wrapping quotes stripped; null when empty or not text. */
export function cleanLine(line: unknown): string | null {
  if (typeof line !== 'string') return null;
  const stripped = stripQuotePairs(toOneLine(line));
  const capped = capCodePoints(stripped, BRAIN.maxLineChars).trim();
  return capped === '' || [...capped].every(isQuote) ? null : capped;
}

/** The model's raw option text as one short line, safe to put in a note. */
function nameForNote(option: string): string {
  return capCodePoints(toOneLine(option), NOTE_NAME_CHARS).trim();
}

/** Reads a model's JSON reply against the shortlist. Never throws. */
export function parseReply(text: string, shortlist: ShortOption[]): ParsedReply {
  const unreadable: ParsedReply = { ok: false, outcome: 'unreadable', reason: 'unreadable reply' };
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    return unreadable;
  }
  if (typeof reply !== 'object' || reply === null) return unreadable;
  const { option, line } = reply as { option?: unknown; line?: unknown };
  if (typeof option !== 'string') return unreadable;
  if (!shortlist.some((o) => o.id === option)) return { ok: false, outcome: 'off_list', reason: `named ${nameForNote(option)}, not on the list` };
  return { ok: true, optionId: option, line: cleanLine(line) };
}
