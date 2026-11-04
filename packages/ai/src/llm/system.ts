import { BRAIN } from '@mule/engine';
import { defaultManual } from './manual.js';

/** What the writer replies and what each strategy field means: the manual gives the rules, this the reply. */
const REPLY = `## Your reply
You write your seat's strategy and your edits to the engine's draft playbook, in character. The brief shows the draft and what you may change.
- Strategy.kind is the plan you play to. builder: develop many plots and grow steady production. specialist: concentrate on one good, your moneyMaker, and sell it. monopolist: corner one good, your monopolyTarget, so others must buy it from you. landBaron: gather plots, since each one counts toward Worth. politician: win office, since each term adds to Worth. spoiler: hold the leader back.
- moneyMaker is the good you mean to earn most from, or null. monopolyTarget is the good you mean to corner, or null: only a monopolist names one, and only a seat whose level may corner. cashFloor is the credits you keep back and do not spend below.
- Each edit names a path the brief offers, the value to set and why. An edit the rules do not allow is refused, and the draft's value plays.
- line is one short sentence you say at the table, at most ${BRAIN.maxLineChars} characters, in the character's voice, or empty. Keep it family-friendly.
Reply with JSON only, in the shape the schema gives.`;

/**
 * The system text of every playbook write: the manual, then the reply. The same bytes for every seat, level and month
 * of a given config, so it is cached; a seat's own bounds go in its brief.
 */
export const WRITER_SYSTEM = [
  'You play one seat in a colony trading game in the spirit of M.U.L.E.: a few players share a young colony and each tries to end with the highest Worth.',
  '',
  defaultManual(),
  '',
  REPLY,
].join('\n');
