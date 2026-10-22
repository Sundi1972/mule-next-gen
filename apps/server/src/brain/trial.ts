/**
 * The G-2 proof: Smart seats against strategist seats, reporting UBER-AC-1 and UBER-AC-2.
 * Usage: pnpm --filter @mule/server brain:trial -- --games 20 --seed 101 [--smart 2] [--max-usd X]
 * Without the key every seat plays Classic and nothing is called. With it, real money: one run per UTC day.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BRAIN } from '@mule/engine';
import { playGameAsync, ReplyRejected, simSeats, type Choice, type Decider, type DecisionRecord, type SeatSpec } from '@mule/ai';
import { claimLedger, DATA_DIR, day, numberFlags, runAsScript, type MainDeps } from './cli.js';
import { CallFailed } from './client.js';
import { API_KEY_ENV, apiKeyFrom, createBrain, type BrainSeat } from './index.js';
import type { CallLine } from './ledger.js';
import { capText, cutOffPhase, renderTrialReport, SEATS, sum, trialReport, type TrialGame, type TrialReport, type TrialStop } from './trial-report.js';

/** Thrown from `between` to stop a game once the API refused the credentials. */
class AuthRefused extends Error {
  constructor() {
    super('the API refused the credentials');
    this.name = 'AuthRefused';
  }
}

interface GameSetup {
  seed: number;
  id: string;
  env: Readonly<Record<string, string | undefined>>;
  logPath: string | null;
  smart: number;
  out: (line: string) => void;
}

/** Adds one to `counts[month - 1]`. */
const bump = (counts: number[], month: number) => {
  counts[month - 1] = (counts[month - 1] ?? 0) + 1;
};

/** Plays one game with its own brain; pauses simulated time while a model call is open, and always closes the brain. */
async function playTrialGame(setup: GameSetup): Promise<TrialGame> {
  const { id } = setup;
  const brain = createBrain({ gameId: id, env: setup.env, ...(setup.logPath === null ? {} : { logPath: setup.logPath }) });
  const game: TrialGame = { id, end: 'unfinished', months: 0, smart: [], decisions: [], lines: {}, modelLines: {}, cutOff: [], countedUsd: 0, settledCalls: 0 };
  const inflight = new Set<Promise<Choice>>();
  const chat = new Map<string, (record: DecisionRecord) => void>();
  let authRefused = false;
  // The record being routed to a seat's chatter, read by its say.
  let routing: DecisionRecord | null = null;

  const tracked = (decider: Decider): Decider => ({
    name: decider.name,
    decide(shortlist, persona, context) {
      const answer = decider.decide(shortlist, persona, context);
      if (!(answer instanceof Promise)) return answer;
      inflight.add(answer);
      answer.then(
        () => {
          inflight.delete(answer);
          game.settledCalls += 1;
        },
        (err: unknown) => {
          inflight.delete(answer);
          // A call was made only if it failed in the client or its reply was rejected; busy, budget and game over made none.
          if (err instanceof CallFailed || err instanceof ReplyRejected) game.settledCalls += 1;
          if (err instanceof CallFailed && err.auth) authRefused = true;
        },
      );
      return answer;
    },
  });

  const deciderFor = (seatId: string, spec: SeatSpec, index: number): Decider | null => {
    if (index >= setup.smart) return null;
    const seat: BrainSeat = { id: seatId, persona: spec.persona, level: spec.level };
    const decider = brain.deciderFor(seat);
    if (!decider) return null;
    game.smart.push(seatId);
    const said: number[] = [];
    const modelSaid: number[] = [];
    game.lines[seatId] = said;
    game.modelLines[seatId] = modelSaid;
    chat.set(
      seatId,
      brain.chatter(seat, () => {
        if (!routing) return;
        bump(said, routing.month);
        if (routing.by === 'llm') bump(modelSaid, routing.month);
      }),
    );
    return tracked(decider);
  };

  try {
    const played = await playGameAsync(setup.seed, simSeats(SEATS, 'trader', setup.seed), {
      deciderFor,
      onDecision: (r) => {
        game.decisions.push({ seat: r.seat, kind: r.kind, by: r.by, options: r.shortlist.length, ...(r.note === undefined ? {} : { note: r.note }) });
        const say = chat.get(r.seat);
        if (!say) return;
        routing = r;
        say(r);
        routing = null;
      },
      onPhase: (state) => {
        const cut = cutOffPhase(state);
        if (cut) game.cutOff.push(cut);
      },
      // Each call is bounded by its kind's wait, so this pauses simulated time for at most that long. See C6.
      between: async () => {
        if (authRefused) throw new AuthRefused();
        if (inflight.size > 0) await Promise.allSettled([...inflight]);
        if (authRefused) throw new AuthRefused();
      },
    });
    game.months = played.state.month;
    game.end = played.state.phase === 'gameOver' ? 'over' : 'unfinished';
  } catch (err) {
    game.end = err instanceof AuthRefused ? 'auth' : 'crashed';
    if (game.end === 'crashed') setup.out(`game ${id} threw: ${err instanceof Error ? err.message.slice(0, 120) : 'unknown error'}`);
  } finally {
    // A call still open would bill after the game closed.
    await Promise.allSettled([...inflight]);
    brain.finish();
  }
  game.countedUsd = brain.countedUsd();
  return game;
}

/** The ledger's call lines; a missing file has none. Throws on a line that is not JSON, so the run stops rather than undercount. */
function readCalls(file: string): CallLine[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as CallLine | { type: 'game' })
    .filter((l): l is CallLine => !('type' in l));
}

export interface TrialFlags {
  games: number;
  seed: number;
  smart: number;
  /** Null when not given: a paid run needs it. */
  maxUsd: number | null;
}

const USAGE = 'Usage: brain:trial [--games N] [--seed S] [--smart K] [--max-usd X]; nothing played.';

/** The flags, or null for anything numberFlags refuses or a value out of range. */
function parseFlags(argv: readonly string[]): TrialFlags | null {
  const given = numberFlags(argv, ['--games', '--seed', '--smart', '--max-usd']);
  if (!given) return null;
  const flags = {
    games: given.get('--games') ?? 20,
    seed: given.get('--seed') ?? 101,
    smart: given.get('--smart') ?? 2,
    maxUsd: given.get('--max-usd') ?? null,
  };
  const ok = Number.isInteger(flags.games) && flags.games >= 1 && Number.isInteger(flags.seed) && Number.isInteger(flags.smart);
  return ok && flags.smart >= 1 && flags.smart <= SEATS && (flags.maxUsd === null || flags.maxUsd > 0) ? flags : null;
}

/**
 * Runs the trial and prints its report. Exit code with the key: 0 done or capped, 1 bad flags, today's run already
 * made or a ledger write lost, 2 stopped on an auth failure. Without it: 0 when every game finished unstalled and
 * all-Classic, otherwise 1.
 */
export async function trial(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  deps: MainDeps = {},
): Promise<{ code: number; report: TrialReport | null }> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const flags = parseFlags(argv);
  if (!flags) {
    out(USAGE);
    return { code: 1, report: null };
  }
  const keyed = apiKeyFrom(env) !== null;
  if (keyed && flags.maxUsd === null) {
    out(`brain:trial spends real money with ${API_KEY_ENV} set: give --max-usd, the cap that was cleared; nothing called.`);
    return { code: 1, report: null };
  }
  const today = day((deps.now ?? (() => new Date()))());
  const logPath = keyed ? path.join(deps.dataDir ?? DATA_DIR, `trial-${today}.jsonl`) : null;
  const cap = keyed ? flags.maxUsd : null;
  const capUsd = cap ?? 0;

  if (logPath === null) {
    out(`${API_KEY_ENV} is not set: every seat plays Classic and nothing is called.`);
  } else if (fs.existsSync(logPath)) {
    out(`${logPath} exists: brain:trial already ran today, and each paid run needs its own clearance; nothing called.`);
    return { code: 1, report: null };
  } else {
    out(
      `brain:trial model ${BRAIN.model}, cap ${capText(capUsd)}, planned ${flags.games} games with ${flags.smart} Smart seats ` +
        `(each held to $${BRAIN.seatBudgetUsd.toFixed(2)} a game), ledger ${logPath}`,
    );
  }

  const games: TrialGame[] = [];
  let stopped: TrialStop = 'done';
  let lostLines = '';
  for (let i = 0; i < flags.games; i++) {
    if (logPath !== null && cap !== null) {
      const counted = sum(games.map((g) => g.countedUsd));
      // Each Smart seat's budget holds its game to BRAIN.seatBudgetUsd, unknown bills included. !(<=) refuses a NaN.
      if (!(counted + flags.smart * BRAIN.seatBudgetUsd <= cap)) {
        stopped = 'cap';
        break;
      }
      // The day's clearance is used once, by the run that starts the first game.
      if (i === 0) claimLedger(logPath);
    }
    const seed = flags.seed + i;
    const game = await playTrialGame({ seed, id: `trial-${today}-${flags.seed}-${i}`, env, logPath, smart: flags.smart, out });
    games.push(game);
    out(`game ${i + 1}/${flags.games} seed ${seed}: ${game.end}, ${game.cutOff.length} phases cut off, ${game.settledCalls} model calls`);
    if (game.end === 'auth') {
      stopped = 'auth';
      break;
    }
    if (logPath !== null) {
      const written = readCalls(logPath).filter((c) => c.game === game.id && c.outcome !== 'budget').length;
      if (written < game.settledCalls) {
        lostLines = `Stopped: the ledger ${logPath} has ${written} of ${game.settledCalls} call lines for game ${game.id}; a write failed, so spend cannot be checked.`;
        stopped = 'ledger';
        break;
      }
    }
  }

  const report = trialReport({
    keyed,
    planned: flags.games,
    stopped,
    smartPerGame: keyed ? flags.smart : 0,
    cap,
    games,
    calls: logPath === null ? [] : readCalls(logPath),
  });
  for (const line of renderTrialReport(report)) out(line);
  if (stopped === 'cap' && games.length === 0) {
    out(`No game started: cap ${capText(capUsd)} is below one game's Smart budgets ($${(flags.smart * BRAIN.seatBudgetUsd).toFixed(2)}).`);
  }
  if (stopped === 'auth') {
    out('Stopped: the API refused the credentials (401/403). Nothing more was called.');
    return { code: 2, report };
  }
  if (stopped === 'ledger') {
    out(lostLines);
    return { code: 1, report };
  }
  return { code: keyed || report.ac2 === 'pass' ? 0 : 1, report };
}

export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: MainDeps = {}): Promise<number> {
  return (await trial(argv, env, deps)).code;
}

runAsScript(import.meta.url, 'brain:trial', main);
