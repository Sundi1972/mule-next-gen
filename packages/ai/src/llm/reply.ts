import type { ShortOption } from '../decider.js';

export function parseReply(_text: string, _shortlist: ShortOption[]): { optionId: string; line: string | null } | null {
  throw new Error('NotImplemented: parse-reply');
}
