/** Which of a seat's decision lines reach the table chat. See RULE-2. */
import { BRAIN } from '@mule/engine';
import type { DecisionRecord } from '@mule/ai';

/** One seat's lines said in `month`, and the phases of that month it has spoken in. */
interface ChatCount {
  month: number;
  said: number;
  phases: ReadonlySet<string>;
}

/** Matches no month, so the first record starts a count. */
const NO_LINES: ChatCount = { month: Number.NaN, said: 0, phases: new Set() };

/** The line to say (null for none) and the seat's count after it. A blank line counts as null, as does a muted one. */
function throttle(count: ChatCount, record: Pick<DecisionRecord, 'line' | 'month' | 'phase' | 'by'>, muted: (by: DecisionRecord['by']) => boolean): { say: string | null; count: ChatCount } {
  const now = count.month === record.month ? count : { month: record.month, said: 0, phases: new Set<string>() };
  if (!record.line?.trim() || muted(record.by)) return { say: null, count: now };
  if (now.said >= BRAIN.linesPerMonth) return { say: null, count: now };
  if (now.phases.has(record.phase)) return { say: null, count: now };
  return { say: record.line, count: { month: now.month, said: now.said + 1, phases: new Set([...now.phases, record.phase]) } };
}

/** Who speaks: a Classic seat's every line; a Smart seat's model lines and fallbacks, never a top pick's template. */
export type Voice = 'classic' | 'smart';

/**
 * Seat `seat`'s onDecision: says at most BRAIN.linesPerMonth lines a month, and one a phase. A Smart seat's top picks
 * (its routine moves, made before its close calls in a phase) speak no template line, so the phase's line waits for the
 * model's (PM ruling, 5 Nov). Never throws; the first say that throws is reported with console.error, naming the seat
 * and the error but not the line.
 */
export function chatter(seat: string, say: (line: string) => void, voice: Voice = 'classic'): (record: DecisionRecord) => void {
  const muted = (by: DecisionRecord['by']) => voice === 'smart' && by === 'top';
  let count = NO_LINES;
  let reported = false;
  return (record) => {
    const next = throttle(count, record, muted);
    // Count before saying: a say that throws still used its slot and its phase, so the cap bounds say calls.
    count = next.count;
    if (next.say === null) return;
    try {
      say(next.say);
    } catch (err) {
      // say runs outside the room's error handling; a chat failure must not stall the decision.
      if (reported) return;
      reported = true;
      console.error(`brain chat: seat ${seat} cannot say a line: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}
