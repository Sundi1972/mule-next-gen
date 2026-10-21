import { describe, expect, it } from 'vitest';
import { BRAIN } from '@mule/engine';
import type { ShortOption } from '../src/decider.js';
import { parseReply } from '../src/llm/reply.js';

const option = (id: string): ShortOption => ({ id, key: id.toLowerCase(), label: id, utility: 0.5, value: 0, rationale: '' });
const three = [option('A'), option('B'), option('C')];

describe('reply parsing', () => {
  const cases: Array<{ name: string; text: string; expected: { optionId: string; line: string | null } | null }> = [
    { name: 'row 1: junk text is unreadable', text: 'I would pick B, thanks', expected: null },
    { name: 'row 1: JSON without an option is unreadable', text: '{"line":"hi"}', expected: null },
    { name: 'row 1: a non-string option is unreadable', text: '{"option":2,"line":"hi"}', expected: null },
    { name: 'row 1: JSON that is not an object is unreadable', text: 'null', expected: null },
    { name: 'row 2: an option off the list is refused', text: '{"option":"F"}', expected: null },
    { name: 'row 3: quotes and a trailing newline are stripped', text: '{"option":"B","line":"\\"Mine.\\"\\n"}', expected: { optionId: 'B', line: 'Mine.' } },
    { name: 'row 3: curly quotes are stripped', text: '{"option":"A","line":"“Mine.”"}', expected: { optionId: 'A', line: 'Mine.' } },
    { name: 'row 3: newlines collapse to one line', text: '{"option":"C","line":"one\\ntwo"}', expected: { optionId: 'C', line: 'one two' } },
    { name: 'row 3: an empty line becomes null', text: '{"option":"A","line":"  "}', expected: { optionId: 'A', line: null } },
    { name: 'row 3: a quotes-only line becomes null', text: '{"option":"A","line":"\\"\\""}', expected: { optionId: 'A', line: null } },
    { name: 'row 3: a missing line is null', text: '{"option":"A"}', expected: { optionId: 'A', line: null } },
    { name: 'row 3: a non-string line is null', text: '{"option":"A","line":7}', expected: { optionId: 'A', line: null } },
    {
      name: 'row 3: a 300-char line is capped at the line limit',
      text: JSON.stringify({ option: 'A', line: 'x'.repeat(300) }),
      expected: { optionId: 'A', line: 'x'.repeat(BRAIN.maxLineChars) },
    },
  ];

  it.each(cases)('T-AC-1: parseReply follows RULE-1 and clean() - $name', ({ text, expected }) => {
    expect(parseReply(text, three)).toEqual(expected);
  });
});
