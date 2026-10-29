import { BRAIN, type AiLevelId, type AiPersonaId } from '@mule/engine';
import { LlmDecider, ReplyRejected, unusableReply, writeReply, type Complete, type Decider, type DecisionRecord, type WriteAsk, type WriteComplete, type WriterReply } from '@mule/ai';
import { createBudget, MOVE_CALL, worstCaseUsd, type PromptText } from './budget.js';
import { chatter } from './chat.js';
import { billUnknown, CallFailed, createAnthropicSdk, createHaikuComplete, createWriteComplete, WRITE_CALLS, WRITE_FALLBACK_MODEL, type HaikuReply, type HaikuSdk, type WriteKind } from './client.js';
import { createLedger, NO_USAGE, type LedgerKind, type ModelId, type Outcome, type Usage } from './ledger.js';

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
  /** A playbook writer for a Smart seat, or null: the seat plays the engine's playbooks. */
  writerFor(seat: BrainSeat): PlaybookWriter | null;
  /** The seat's onDecision callback: passes its lines to `say`: at most BRAIN.linesPerMonth a month and one a phase. Never throws. See RULE-2. */
  chatter(seat: BrainSeat, say: (line: string) => void): (record: DecisionRecord) => void;
  /** Closes the game; a Smart brain that built a decider also writes its total line. A second call does nothing. */
  finish(): void;
}

export type { WriteAsk };

/** A write call as the game asks it: the writer's ask, and whether its reply has come too late to take effect. */
export interface PlaybookAsk extends WriteAsk {
  /** True once the phase the reply serves has started: a reply that comes then gets a second ledger line, 'late'. */
  late?: () => boolean;
}

/**
 * A seat's strategy and playbook writer. `write` never throws: every failure is the reply's cause. A busy seat, a game
 * that is over, a wait that is not above 0, or a budget no model fits returns cause 'no_reply' without a model call.
 */
export interface PlaybookWriter {
  write(kind: WriteKind, ask: PlaybookAsk): Promise<WriterReply>;
}

/** The brain as its owner holds it: the game's contract, plus the spend a run caps on. */
export interface MeteredBrain extends BrainService {
  /** The game's counted spend, as its budget checks it; after finish, the figure at finish. Classic: 0. */
  countedUsd(): number;
}

export interface BrainOptions {
  gameId: string;
  /** Only API_KEY_ENV is read from it. */
  env?: Readonly<Record<string, string | undefined>>;
  logPath?: string;
  /** Builds the SDK from the key; called once, and never without a key. */
  sdkFactory?: (apiKey: string) => HaikuSdk;
  now?: () => number;
  /** The most the game's Smart seats together may spend, above 0 and at most BRAIN.gameBudgetUsd (the default). */
  gameBudgetUsd?: number;
}

/** The port refused before calling. `lockedNow` is true for the refusal that locked the seat, the only one with a line. */
class BudgetSpent extends Error {
  constructor(readonly lockedNow: boolean) {
    super('budget spent');
    this.name = 'BudgetSpent';
  }
}

/** No model a write call may use fits the seat's share and the game budget: no call is made. */
class NoModelFits extends Error {
  constructor() {
    super('no model fits the budget');
    this.name = 'NoModelFits';
  }
}

/** One decision's call, as the port saw it. */
interface CallSlot {
  called: boolean;
  worstUsd: number;
  reply: HaikuReply | null;
}

/** A settled write call's ledger outcome: a reply none of which could be read is 'unreadable', as for a move. */
function writeOutcomeOf(reply: Pick<HaikuReply, 'stopReason'> | null, failure: unknown, written: WriterReply): Exclude<Outcome, 'budget'> {
  const outcome = outcomeOf(reply, failure);
  return outcome === 'llm' && written.reply.cause !== undefined ? 'unreadable' : outcome;
}

/** A settled call's ledger outcome: from the reply's stop reason or the failure's type, never from message text. See RULE-4. */
export function outcomeOf(reply: Pick<HaikuReply, 'stopReason'> | null, failure: unknown): Exclude<Outcome, 'budget'> {
  if (reply?.stopReason === 'refusal') return 'refused';
  if (failure === undefined) return 'llm';
  if (failure instanceof CallFailed || failure instanceof ReplyRejected) return failure.outcome;
  return 'error';
}

/** Without the key there is no client and no decider, so nothing can make a paid call. See RULE-3. */
const CLASSIC: MeteredBrain = {
  deciderFor: () => null,
  writerFor: () => null,
  chatter: (seat, say) => chatter(seat.id, say),
  finish: () => {},
  countedUsd: () => 0,
};

/** The key's environment variable: the only place in production source its name is written. */
export const API_KEY_ENV = 'ANTHROPIC_API_KEY';

/** The one place the key is read: only API_KEY_ENV, trimmed; a blank key is null. See HC-2. */
export function apiKeyFrom(env: Readonly<Record<string, string | undefined>>): string | null {
  return env[API_KEY_ENV]?.trim() || null;
}

/**
 * The brain for one game. A missing or blank key plays Classic.
 * Throws a RangeError for a game budget that is not above 0 and at most BRAIN.gameBudgetUsd, with or without the key.
 */
export function createBrain(options: BrainOptions): MeteredBrain {
  const gameBudgetUsd = options.gameBudgetUsd ?? BRAIN.gameBudgetUsd;
  if (!(gameBudgetUsd > 0 && gameBudgetUsd <= BRAIN.gameBudgetUsd)) {
    throw new RangeError(`gameBudgetUsd must be above 0 and at most ${BRAIN.gameBudgetUsd}`);
  }
  const apiKey = apiKeyFrom(options.env ?? process.env);
  if (!apiKey) return CLASSIC;

  const { gameId } = options;
  const sdk = (options.sdkFactory ?? createAnthropicSdk)(apiKey);
  const haiku = createHaikuComplete(sdk, options.now);
  const writeComplete = createWriteComplete(sdk, options.now);
  const ledger = createLedger(options.logPath === undefined ? {} : { path: options.logPath });
  // The game's Smart seats: each one registered here takes an equal share of the game budget.
  const seats = new Set<string>();
  const budget = createBudget(ledger, { budgetUsd: gameBudgetUsd, seats: () => seats });
  // Seat ids with a model call open, across every decider and writer for that seat.
  const busy = new Set<string>();
  let finished = false;
  // A game that never asked for a decider or a writer (a lobby abandoned before Start) leaves no game line.
  let asked = false;
  // finish releases the budget's figures, so the counted spend is kept from that moment.
  let countedAtFinish: number | null = null;
  const counted = () => [...seats].reduce((sum, seat) => sum + budget.spent(gameId, seat), 0);

  /** Registers a Smart seat, and returns how its calls are ledgered; null once the game is over. */
  function enter(seat: BrainSeat) {
    if (finished) return null;
    asked = true;
    seats.add(seat.id);
    return (kind: LedgerKind, model: ModelId, outcome: Outcome, usage: Usage, ms: number) =>
      ledger.record({ game: gameId, seat: seat.id, persona: seat.persona, level: seat.level, model, kind, ms, outcome, ...usage });
  }

  function deciderFor(seat: BrainSeat): Decider | null {
    const line = enter(seat);
    if (!line) return null;
    const write = (kind: DecisionRecord['kind'], outcome: Outcome, usage: Usage, ms: number) => line(kind, BRAIN.model, outcome, usage, ms);

    const portFor =
      (slot: CallSlot): Complete =>
      async (prompt, waitMs) => {
        if (finished) throw new Error('game over');
        slot.worstUsd = worstCaseUsd(prompt, MOVE_CALL);
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

  function writerFor(seat: BrainSeat): PlaybookWriter | null {
    const line = enter(seat);
    if (!line) return null;

    /** The kind's model if its worst case fits, else the fallback's if that fits, else none. Never locks the seat. */
    const modelFor = (prompt: PromptText, call: { model: ModelId; maxTokens: number }) => {
      for (const model of [call.model, WRITE_FALLBACK_MODEL]) {
        // A model with no price table could never be counted, so it is never allowed.
        if (!Object.hasOwn(BRAIN.priceTable, model)) continue;
        const worstUsd = worstCaseUsd(prompt, { model, maxTokens: call.maxTokens });
        if (budget.fits(gameId, seat.id, worstUsd)) return { model, worstUsd };
      }
      return null;
    };
    return {
      async write(kind, ask) {
        if (finished || busy.has(seat.id) || !(ask.waitMs > 0)) return unusableReply('no_reply');
        busy.add(seat.id);
        const call = WRITE_CALLS[kind];
        const slot: CallSlot = { called: false, worstUsd: 0, reply: null };
        let model: ModelId = call.model;
        let failure: unknown;
        // The writer turns any throw from here into its 'no_reply' cause, so the port keeps what was thrown.
        const port: WriteComplete = async (prompt, waitMs) => {
          try {
            if (finished) throw new Error('game over');
            const pick = modelFor(prompt, call);
            if (!pick) throw new NoModelFits();
            model = pick.model;
            slot.worstUsd = pick.worstUsd;
            slot.called = true;
            slot.reply = await writeComplete(kind, prompt, model, waitMs);
            return { text: slot.reply.text, stopReason: slot.reply.stopReason };
          } catch (err) {
            failure = err ?? new Error('unknown error');
            throw err;
          }
        };
        let written = unusableReply('no_reply');
        try {
          written = await writeReply(port, ask);
        } catch (err) {
          failure ??= err ?? new Error('unknown error');
        } finally {
          busy.delete(seat.id);
          if (failure instanceof NoModelFits) {
            line(kind, call.model, 'budget', NO_USAGE, 0);
          } else if (slot.called) {
            const ms = slot.reply?.ms ?? (failure instanceof CallFailed ? failure.ms : 0);
            const outcome = writeOutcomeOf(slot.reply, failure, written);
            line(kind, model, outcome === 'llm' && model !== call.model ? 'fallback' : outcome, slot.reply?.usage ?? NO_USAGE, ms);
            if (billUnknown(slot.reply, failure) && !finished) budget.countUnknownBill(gameId, seat.id, slot.worstUsd);
            if (slot.reply && ask.late?.()) line(kind, model, 'late', NO_USAGE, 0);
          }
        }
        return written;
      },
    };
  }

  return {
    deciderFor,
    writerFor,
    chatter: (seat, say) => chatter(seat.id, say),
    finish() {
      countedAtFinish ??= counted();
      finished = true;
      if (asked) ledger.finish(gameId);
      budget.release(gameId);
    },
    countedUsd: () => countedAtFinish ?? counted(),
  };
}
