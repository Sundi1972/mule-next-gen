import { BRAIN } from '@mule/engine';
import { defaultManual } from './manual.js';

/** What the writer replies and what each strategy field means: the manual gives the rules, this the reply. */
const REPLY = `## Your reply
Your aim is to win: the highest Worth at the end. You write your seat's strategy and your edits to the engine's draft playbook to raise your Worth against your rivals'; your character colours your table line and nothing else. The brief shows the standings, the draft and what you may change.
- Strategy.kind is the plan you play to. builder: develop many plots and grow steady production. specialist: concentrate on one good, your moneyMaker, and sell it. monopolist: corner a good so others must buy it from you, only for a seat whose level may corner. landBaron: gather plots, since each one counts toward Worth. politician: win office, since each term adds to Worth. spoiler: hold the leader back.
- moneyMaker is the good you mean to earn most from, or null.
- Each edit names a path the brief offers, the value to set and why. A plan letter must be one the brief lists. An edit past what the rules allow is clamped to the nearest value they allow and plays, or is refused and the draft's value plays; your next brief lists each one with why.
- Where the brief says a draft part does not play if you keep it, only your edit makes it play: send the part as your edit to have it played.
- line is one short sentence you say at the table, at most ${BRAIN.maxLineChars} characters, in the character's voice, or empty. Keep it family-friendly.
Reply with JSON only, in the shape the schema gives.

## Tools
Before you reply you may call the game's tools, a few rounds per answer, to check a choice before you commit to it:
- legalMoves: the moves of a phase, what each does and costs you now, and the store prices now.
- worth: your Worth now, line by line, as the game counts it at the end.
- standings: every seat's Worth now, best first.
- whatIf: when you write your month's strategy, plays your playbook with the edits you give over one month on a copy of the game, and returns your Worth after it and any edit the rules refused.`;

/**
 * The system text of every playbook write: the manual, then the reply. The same bytes for every seat, level and month
 * of a given config, so it is cached; a seat's own bounds go in its brief.
 */
export const WRITER_SYSTEM = [
  'You play one seat in a colony trading game in the spirit of M.U.L.E.: a few players share a young colony and each tries to end with the highest Worth. You play to win.',
  '',
  defaultManual(),
  '',
  REPLY,
].join('\n');
