/** Which of a seat's decision lines reach the table chat. See RULE-2. */
import { BRAIN } from '@mule/engine';
import type { DecisionRecord } from '@mule/ai';

/** One seat's lines said in `month`. */
interface ChatCount {
  month: number;
  said: number;
}

/** Matches no month, so the first record starts a count. */
const NO_LINES: ChatCount = { month: Number.NaN, said: 0 };

/** RULE-2: the line to say (null for none) and the seat's count after it. A blank line counts as null. */
function throttle(count: ChatCount, record: Pick<DecisionRecord, 'line' | 'month'>): { say: string | null; count: ChatCount } {
  const now = count.month === record.month ? count : { month: record.month, said: 0 };
  if (!record.line?.trim()) return { say: null, count: now };
  if (now.said >= BRAIN.linesPerMonth) return { say: null, count: now };
  return { say: record.line, count: { month: now.month, said: now.said + 1 } };
}

/** One seat's onDecision: says at most BRAIN.linesPerMonth lines a month. Never throws. */
export function chatter(say: (line: string) => void): (record: DecisionRecord) => void {
  let count = NO_LINES;
  return (record) => {
    const next = throttle(count, record);
    // Count before saying: a say that throws still used its slot, so the cap bounds say calls.
    count = next.count;
    if (next.say === null) return;
    try {
      say(next.say);
    } catch {
      // say runs outside the room's error handling; a chat failure must not stall the decision.
    }
  };
}
