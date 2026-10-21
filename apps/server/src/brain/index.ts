import { BRAIN, type AiLevelId, type AiPersonaId } from '@mule/engine';
import { LlmDecider, ReplyRejected, type Complete, type Decider, type DecisionRecord } from '@mule/ai';
import { createBudget } from './budget.js';
import { CallFailed, createAnthropicSdk, createHaikuComplete, type HaikuReply, type HaikuSdk } from './client.js';
import { createLedger, type Outcome, type Usage } from './ledger.js';

/** The seat a decider is built for: its id, persona and level. */
export interface BrainSeat {
  id: string;
  persona: AiPersonaId;
  level: AiLevelId;
}

/** What the game sees of the brain (§9 read contract). */
export interface BrainService {
  /** A decider for a Smart seat, or null: the seat plays Classic. */
  deciderFor(seat: BrainSeat): Decider | null;
  /** The seat's onDecision callback. Passes nothing to the table yet. */
  chatter(seat: BrainSeat, say: (line: string) => void): (record: DecisionRecord) => void;
  /** Writes the game's total line and closes the game: no decider makes a call for it afterwards. */
  finish(): void;
}

export interface BrainOptions {
  gameId: string;
  /** Only ANTHROPIC_API_KEY is read from it. */
  env?: Readonly<Record<string, string | undefined>>;
  logPath?: string;
  /** Builds the SDK from the key; called once, and never without a key. */
  sdkFactory?: (apiKey: string) => HaikuSdk;
  now?: () => number;
}

const NO_USAGE: Usage = { input: 0, cached_read: 0, cache_write: 0, output: 0 };

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
  reply: HaikuReply | null;
}

const passThrough = (): ((record: DecisionRecord) => void) => () => {};

/** RULE-3 row 1: without the key there is no client and no decider, so nothing can make a paid call. */
const CLASSIC: BrainService = {
  deciderFor: () => null,
  chatter: passThrough,
  finish: () => {},
};

/** The one place the key is read (HC-2): only ANTHROPIC_API_KEY, trimmed; a blank key is null. */
export function apiKeyFrom(env: Readonly<Record<string, string | undefined>>): string | null {
  return env.ANTHROPIC_API_KEY?.trim() || null;
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

  function deciderFor(seat: BrainSeat): Decider | null {
    if (finished) return null;

    const write = (kind: DecisionRecord['kind'], outcome: Outcome, usage: Usage, ms: number) =>
      ledger.record({ game: gameId, seat: seat.id, persona: seat.persona, level: seat.level, model: BRAIN.model, kind, ms, outcome, ...usage });

    const portFor =
      (slot: CallSlot): Complete =>
      async (prompt, waitMs) => {
        const { allowed, lockedNow } = budget.allow(gameId, seat.id, budget.worstCase(prompt));
        if (!allowed) throw new BudgetSpent(lockedNow);
        slot.called = true;
        slot.reply = await haiku(prompt, waitMs);
        return { text: slot.reply.text };
      };

    /** RULE-4: the outcome from the reply's stop reason or the error's type, never from message text. */
    const outcomeOf = (slot: CallSlot, err: unknown): Outcome => {
      if (slot.reply?.stopReason === 'refusal') return 'refused';
      if (err === undefined) return 'llm';
      if (err instanceof CallFailed || err instanceof ReplyRejected) return err.outcome;
      return 'error';
    };

    return {
      name: 'llm',
      async decide(shortlist, persona, context) {
        if (finished) throw new Error('game over');
        if (busy.has(seat.id)) throw new Error('busy');
        busy.add(seat.id);
        const slot: CallSlot = { called: false, reply: null };
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
            const source = failure instanceof CallFailed ? failure : slot.reply;
            write(context.kind, outcomeOf(slot, failure), source?.usage ?? NO_USAGE, source?.ms ?? 0);
          }
        }
      },
    };
  }

  return {
    deciderFor,
    chatter: passThrough,
    finish() {
      finished = true;
      ledger.finish(gameId);
      budget.release(gameId);
    },
  };
}
