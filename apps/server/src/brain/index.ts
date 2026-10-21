import { BRAIN, type AiLevelId, type AiPersonaId } from '@mule/engine';
import { LlmDecider, ReplyRejected, type Complete, type Decider, type DecisionRecord } from '@mule/ai';
import { createBudget, worstCaseUsd } from './budget.js';
import { chatter } from './chat.js';
import { billUnknown, CallFailed, createAnthropicSdk, createHaikuComplete, type HaikuReply, type HaikuSdk } from './client.js';
import { createLedger, NO_USAGE, type Outcome, type Usage } from './ledger.js';

/** The seat a decider is built for: its id, persona and level. */
export interface BrainSeat {
  id: string;
  persona: AiPersonaId;
  level: AiLevelId;
}

/** What the game sees of the brain: its read contract with MuleGame. */
export interface BrainService {
  /** A decider for a Smart seat, or null: the seat plays Classic. */
  deciderFor(seat: BrainSeat): Decider | null;
  /** The seat's onDecision callback: passes its lines to `say`: at most BRAIN.linesPerMonth a month and one a phase. Never throws. See RULE-2. */
  chatter(seat: BrainSeat, say: (line: string) => void): (record: DecisionRecord) => void;
  /** Closes the game; a Smart brain that built a decider also writes its total line. A second call does nothing. */
  finish(): void;
}

export interface BrainOptions {
  gameId: string;
  /** Only API_KEY_ENV is read from it. */
  env?: Readonly<Record<string, string | undefined>>;
  logPath?: string;
  /** Builds the SDK from the key; called once, and never without a key. */
  sdkFactory?: (apiKey: string) => HaikuSdk;
  now?: () => number;
}

/** The port refused before calling. `lockedNow` is true for the refusal that locked the seat, the only one with a line. */
class BudgetSpent extends Error {
  constructor(readonly lockedNow: boolean) {
    super('budget spent');
    this.name = 'BudgetSpent';
  }
}

/** One decision's call, as the port saw it. */
interface CallSlot {
  called: boolean;
  worstUsd: number;
  reply: HaikuReply | null;
}

/** A settled call's ledger outcome: from the reply's stop reason or the failure's type, never from message text. See RULE-4. */
export function outcomeOf(reply: Pick<HaikuReply, 'stopReason'> | null, failure: unknown): Exclude<Outcome, 'budget'> {
  if (reply?.stopReason === 'refusal') return 'refused';
  if (failure === undefined) return 'llm';
  if (failure instanceof CallFailed || failure instanceof ReplyRejected) return failure.outcome;
  return 'error';
}

/** Without the key there is no client and no decider, so nothing can make a paid call. See RULE-3. */
const CLASSIC: BrainService = {
  deciderFor: () => null,
  chatter: (seat, say) => chatter(seat.id, say),
  finish: () => {},
};

/** The key's environment variable: the only place in production source its name is written. */
export const API_KEY_ENV = 'ANTHROPIC_API_KEY';

/** The one place the key is read: only API_KEY_ENV, trimmed; a blank key is null. See HC-2. */
export function apiKeyFrom(env: Readonly<Record<string, string | undefined>>): string | null {
  return env[API_KEY_ENV]?.trim() || null;
}

/** The brain for one game. A missing or blank key plays Classic. */
export function createBrain(options: BrainOptions): BrainService {
  const apiKey = apiKeyFrom(options.env ?? process.env);
  if (!apiKey) return CLASSIC;

  const { gameId } = options;
  const haiku = createHaikuComplete((options.sdkFactory ?? createAnthropicSdk)(apiKey), options.now);
  const ledger = createLedger(options.logPath === undefined ? {} : { path: options.logPath });
  const budget = createBudget(ledger);
  // Seat ids with a model call open, across every decider for that seat.
  const busy = new Set<string>();
  let finished = false;
  // A game that never asked for a decider (a lobby abandoned before Start) leaves no game line.
  let asked = false;

  function deciderFor(seat: BrainSeat): Decider | null {
    if (finished) return null;
    asked = true;

    const write = (kind: DecisionRecord['kind'], outcome: Outcome, usage: Usage, ms: number) =>
      ledger.record({ game: gameId, seat: seat.id, persona: seat.persona, level: seat.level, model: BRAIN.model, kind, ms, outcome, ...usage });

    const portFor =
      (slot: CallSlot): Complete =>
      async (prompt, waitMs) => {
        if (finished) throw new Error('game over');
        slot.worstUsd = worstCaseUsd(prompt);
        const { allowed, lockedNow } = budget.allow(gameId, seat.id, slot.worstUsd);
        if (!allowed) throw new BudgetSpent(lockedNow);
        slot.called = true;
        slot.reply = await haiku(prompt, waitMs);
        return { text: slot.reply.text };
      };

    return {
      name: 'llm',
      async decide(shortlist, persona, context) {
        if (finished) throw new Error('game over');
        if (busy.has(seat.id)) throw new Error('busy');
        busy.add(seat.id);
        const slot: CallSlot = { called: false, worstUsd: 0, reply: null };
        let failure: unknown;
        try {
          return await new LlmDecider(portFor(slot)).decide(shortlist, persona, context);
        } catch (err) {
          failure = err ?? new Error('unknown error');
          throw err;
        } finally {
          busy.delete(seat.id);
          if (failure instanceof BudgetSpent) {
            if (failure.lockedNow) write(context.kind, 'budget', NO_USAGE, 0);
          } else if (slot.called) {
            const ms = slot.reply?.ms ?? (failure instanceof CallFailed ? failure.ms : 0);
            write(context.kind, outcomeOf(slot.reply, failure), slot.reply?.usage ?? NO_USAGE, ms);
            if (billUnknown(slot.reply, failure) && !finished) budget.countUnknownBill(gameId, seat.id, slot.worstUsd);
          }
        }
      },
    };
  }

  return {
    deciderFor,
    chatter: (seat, say) => chatter(seat.id, say),
    finish() {
      finished = true;
      if (asked) ledger.finish(gameId);
      budget.release(gameId);
    },
  };
}
