import { BRAIN } from '@mule/engine';
import type { ShortOption } from '../decider.js';

const QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;

function clean(line: unknown): string | null {
  if (typeof line !== 'string') return null;
  const oneLine = line.replace(/\s+/g, ' ').trim().replace(QUOTES, '').trim();
  const capped = oneLine.slice(0, BRAIN.maxLineChars).trim();
  return capped === '' ? null : capped;
}

/** The option and line a model's JSON reply names; null when unreadable or off the list. Never throws. */
export function parseReply(text: string, shortlist: ShortOption[]): { optionId: string; line: string | null } | null {
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof reply !== 'object' || reply === null) return null;
  const { option, line } = reply as { option?: unknown; line?: unknown };
  if (typeof option !== 'string') return null;
  if (!shortlist.some((o) => o.id === option)) return null;
  return { optionId: option, line: clean(line) };
}
