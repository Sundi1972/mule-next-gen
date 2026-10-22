/**
 * Plays Smart seats against strategist seats and reports whether the Smart AI decides and talks in character, never
 * stalls a game, and stays within its budget. See C6.
 * Usage: pnpm --filter @mule/server brain:trial -- --games 20 --seed 101 [--smart 2] [--max-usd X]
 * Without the key every seat plays Classic and nothing is called. With it, real money: --max-usd is required, and one
 * run per UTC day.
 */
import fs from 'node:fs';
import { BRAIN } from '@mule/engine';
import { playGameAsync, ReplyRejected, simSeats, type Choice, type Decider, type DecisionRecord, type SeatSpec } from '@mule/ai';
import { alreadyRanToday, AUTH_STOPPED, claimLedger, day, dayLedgerPath, numberFlags, resolveDeps, runAsScript, type MainDeps } from './cli.js';
import { CallFailed } from './client.js';
import { API_KEY_ENV, apiKeyFrom, createBrain, type BrainSeat } from './index.js';
import { isCallLine, readLedgerLines, type CallLine } from './ledger.js';
import { capText, cutOffPhase, renderTrialReport, sum, trialReport, type TrialGame, type TrialReport, type TrialStop } from './trial-report.js';

/** AI seats per trial game. */
const SEATS = 4;

/** Thrown from `between` to stop a game once the API refused the credentials. */
class AuthRefused extends Error {
  constructor() {
    super('the API refused the credentials');
    this.name = 'AuthRefused';
  }
}

/** The model calls a game's Smart deciders make: which are open, how many settled, and whether a 401/403 came back. */
function trackCalls() {
  const inflight = new Set<Promise<Choice>>();
  let settled = 0;
  let authRefused = false;

  const track = (decider: Decider): Decider => ({
    name: decider.name,
    decide(shortlist, persona, context) {
      const answer = decider.decide(shortlist, persona, context);
      if (!(answer instanceof Promise)) return answer;
      inflight.add(answer);
      answer.then(
        () => {
          inflight.delete(answer);
          settled += 1;
        },
        (err: unknown) => {
          inflight.delete(answer);
          // A call was made only if it failed in the client or its reply was rejected; busy, budget and game over made none.
          if (err instanceof CallFailed || err instanceof ReplyRejected) settled += 1;
          if (err instanceof CallFailed && err.auth) authRefused = true;
        },
      );
      return answer;
    },
  });

  return {
    track,
    /** Resolves once every open call has settled, however it settled. */
    async drain() {
      if (inflight.size > 0) await Promise.allSettled([...inflight]);
    },
    settled: () => settled,
    authRefused: () => authRefused,
  };
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
  const calls = trackCalls();
  const chat = new Map<string, (record: DecisionRecord) => void>();
  // The record being routed to a seat's chatter, read by its say.
  let routing: DecisionRecord | null = null;

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
    return calls.track(decider);
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
        if (calls.authRefused()) throw new AuthRefused();
        await calls.drain();
        if (calls.authRefused()) throw new AuthRefused();
      },
    });
    game.months = played.state.month;
    game.end = played.state.phase === 'gameOver' ? 'over' : 'unfinished';
  } catch (err) {
    game.end = err instanceof AuthRefused ? 'auth' : 'crashed';
    if (game.end === 'crashed') setup.out(`game ${id} threw: ${err instanceof Error ? err.message.slice(0, 120) : 'unknown error'}`);
  } finally {
    // A call still open would bill after the game closed.
    await calls.drain();
    brain.finish();
  }
  game.settledCalls = calls.settled();
  game.countedUsd = brain.countedUsd();
  return game;
}

/** The ledger's call lines; a file not claimed yet has none. */
function readCalls(file: string): CallLine[] {
  return fs.existsSync(file) ? readLedgerLines(file).filter(isCallLine) : [];
}

/** The stop message when the ledger holds fewer of a game's call lines than calls settled, or null when none is missing. */
function ledgerShortfall(logPath: string, game: TrialGame): string | null {
  const written = readCalls(logPath).filter((c) => c.game === game.id && c.outcome !== 'budget').length;
  if (written >= game.settledCalls) return null;
  return `Stopped: the ledger ${logPath} has ${written} of ${game.settledCalls} call lines for game ${game.id}; a write failed, so spend cannot be checked.`;
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

/** A keyed run's ledger and cap. */
interface Paid {
  logPath: string;
  cap: number;
}

interface PlayedRun {
  games: TrialGame[];
  stopped: TrialStop;
  /** The stop message when a ledger write was lost. */
  lostLines: string | null;
}

/** Plays the planned games in order, starting each only while the cap allows it; stops on a 401/403 or a lost ledger line. */
async function playRun(flags: TrialFlags, env: Readonly<Record<string, string | undefined>>, paid: Paid | null, today: string, out: (line: string) => void): Promise<PlayedRun> {
  const games: TrialGame[] = [];
  for (let i = 0; i < flags.games; i++) {
    if (paid) {
      // Each Smart seat's budget holds its game to BRAIN.seatBudgetUsd, unknown bills included. !(<=) refuses a NaN.
      if (!(sum(games.map((g) => g.countedUsd)) + flags.smart * BRAIN.seatBudgetUsd <= paid.cap)) return { games, stopped: 'cap', lostLines: null };
      // The day's clearance is used once, by the run that starts the first game.
      if (i === 0) claimLedger(paid.logPath);
    }
    const seed = flags.seed + i;
    const game = await playTrialGame({ seed, id: `trial-${today}-${flags.seed}-${i}`, env, logPath: paid?.logPath ?? null, smart: flags.smart, out });
    games.push(game);
    out(`game ${i + 1}/${flags.games} seed ${seed}: ${game.end}, ${game.cutOff.length} phases cut off, ${game.settledCalls} model calls`);
    if (game.end === 'auth') return { games, stopped: 'auth', lostLines: null };
    const lostLines = paid ? ledgerShortfall(paid.logPath, game) : null;
    if (lostLines) return { games, stopped: 'ledger', lostLines };
  }
  return { games, stopped: 'done', lostLines: null };
}

/** 2 on a 401/403, 1 on a lost ledger line; otherwise 0 with the key, and without it 0 only when the key-unset verdict passes. */
function exitCode(keyed: boolean, stopped: TrialStop, report: TrialReport): number {
  if (stopped === 'auth') return 2;
  if (stopped === 'ledger') return 1;
  return keyed || report.ac2 === 'pass' ? 0 : 1;
}

/**
 * Runs the trial and prints its report. Exit code with the key: 0 done or capped, 1 bad flags, no --max-usd, today's
 * run already made or a ledger write lost, 2 stopped on an auth failure. Without it: 0 when every game finished
 * unstalled and all-Classic, otherwise 1.
 */
export async function trial(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  deps: MainDeps = {},
): Promise<{ code: number; report: TrialReport | null }> {
  const { dataDir, out, now } = resolveDeps(deps);
  const flags = parseFlags(argv);
  if (!flags) {
    out(USAGE);
    return { code: 1, report: null };
  }
  const keyed = apiKeyFrom(env) !== null;
  const at = now();
  let paid: Paid | null = null;
  if (!keyed) {
    out(`${API_KEY_ENV} is not set: every seat plays Classic and nothing is called.`);
  } else {
    if (flags.maxUsd === null) {
      out(`brain:trial spends real money with ${API_KEY_ENV} set: give --max-usd, the cap that was cleared; nothing called.`);
      return { code: 1, report: null };
    }
    const logPath = dayLedgerPath(dataDir, 'trial', at);
    const ranToday = alreadyRanToday(logPath, 'brain:trial');
    if (ranToday) {
      out(ranToday);
      return { code: 1, report: null };
    }
    paid = { logPath, cap: flags.maxUsd };
    out(
      `brain:trial model ${BRAIN.model}, cap ${capText(paid.cap)}, planned ${flags.games} games with ${flags.smart} Smart seats ` +
        `(each held to $${BRAIN.seatBudgetUsd.toFixed(2)} a game), ledger ${logPath}`,
    );
  }

  const { games, stopped, lostLines } = await playRun(flags, env, paid, day(at), out);
  const report = trialReport({
    keyed,
    planned: flags.games,
    stopped,
    smartPerGame: keyed ? flags.smart : 0,
    seatsPerGame: SEATS,
    cap: paid?.cap ?? null,
    games,
    calls: paid ? readCalls(paid.logPath) : [],
  });
  for (const line of renderTrialReport(report)) out(line);
  if (paid && stopped === 'cap' && games.length === 0) {
    out(`No game started: cap ${capText(paid.cap)} is below one game's Smart budgets ($${(flags.smart * BRAIN.seatBudgetUsd).toFixed(2)}).`);
  }
  if (stopped === 'auth') out(AUTH_STOPPED);
  if (lostLines) out(lostLines);
  return { code: exitCode(keyed, stopped, report), report };
}

export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: MainDeps = {}): Promise<number> {
  return (await trial(argv, env, deps)).code;
}

runAsScript(import.meta.url, 'brain:trial', main);
