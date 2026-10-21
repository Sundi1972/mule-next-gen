import { describe, expect, it } from 'vitest';
import { BRAIN } from '@mule/engine';
import type { ShortOption } from '../src/decider.js';
import { parseReply, type ParsedReply } from '../src/llm/reply.js';

const option = (id: string): ShortOption => ({ id, key: id.toLowerCase(), label: id, utility: 0.5, value: 0, rationale: '' });
const three = [option('A'), option('B'), option('C')];

const unreadable: ParsedReply = { ok: false, reason: 'unreadable reply' };
const picked = (optionId: string, line: string | null): ParsedReply => ({ ok: true, optionId, line });
const reply = (line: unknown, optionId = 'A') => JSON.stringify({ option: optionId, line });
const x = (n: number) => 'x'.repeat(n);

describe('reply parsing', () => {
  const cases: Array<{ name: string; text: string; expected: ParsedReply }> = [
    { name: 'row 2: junk text is unreadable', text: 'I would pick B, thanks', expected: unreadable },
    { name: 'row 2: JSON without an option is unreadable', text: '{"line":"hi"}', expected: unreadable },
    { name: 'row 2: a non-string option is unreadable', text: '{"option":2,"line":"hi"}', expected: unreadable },
    { name: 'row 2: JSON that is not an object is unreadable', text: 'null', expected: unreadable },
    { name: 'row 3: an option off the list is refused and named', text: '{"option":"F"}', expected: { ok: false, reason: 'named F, not on the list' } },
    { name: 'row 4: quotes and a trailing newline are stripped', text: '{"option":"B","line":"\\"Mine.\\"\\n"}', expected: picked('B', 'Mine.') },
    { name: 'row 4: curly quotes are stripped', text: reply('“Mine.”'), expected: picked('A', 'Mine.') },
    { name: 'row 4: a single-quoted pair is stripped', text: reply("'Mine.'"), expected: picked('A', 'Mine.') },
    { name: 'row 4: nested quotes are stripped', text: reply('"\'Mine.\'"'), expected: picked('A', 'Mine.') },
    { name: 'row 4: space inside the quotes is trimmed after stripping', text: reply('" Mine. "\n'), expected: picked('A', 'Mine.') },
    { name: 'row 4: a leading apostrophe alone stays', text: reply("'tis mine"), expected: picked('A', "'tis mine") },
    { name: 'row 4: a trailing apostrophe alone stays', text: reply("the Players'"), expected: picked('A', "the Players'") },
    { name: 'row 4: any whitespace run collapses to one space', text: reply('one\r\n\ttwo'), expected: picked('A', 'one two') },
    { name: 'row 4: an empty line becomes null', text: reply('  '), expected: picked('A', null) },
    { name: 'row 4: a quotes-only line becomes null', text: reply('""'), expected: picked('A', null) },
    { name: 'row 4: a missing line is null', text: '{"option":"A"}', expected: picked('A', null) },
    { name: 'row 4: a non-string line is null', text: reply(7), expected: picked('A', null) },
    { name: 'row 4: a 300-char line is capped at the line limit', text: reply(x(300)), expected: picked('A', x(BRAIN.maxLineChars)) },
    { name: 'row 4: the cap is trimmed after cutting', text: reply(x(139) + ' ' + 'y'.repeat(100)), expected: picked('A', x(139)) },
    { name: 'row 4: the cap applies after collapsing and stripping', text: reply('  "' + x(300) + '"'), expected: picked('A', x(BRAIN.maxLineChars)) },
    { name: 'row 4: the cap counts code points and keeps an emoji whole', text: reply(x(139) + '\u{1F600}' + x(10)), expected: picked('A', x(139) + '\u{1F600}') },
  ];

  it.each(cases)('T-AC-1: parseReply follows RULE-1 and clean() - $name', ({ text, expected }) => {
    expect(parseReply(text, three)).toEqual(expected);
  });
});
