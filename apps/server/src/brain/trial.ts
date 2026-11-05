/**
 * Plays Smart seats against strategist seats and reports whether the Smart AI decides and talks in character, never
 * stalls a game, and stays within its budget. See C6.
 * Usage: pnpm --filter @mule/server brain:trial -- --games 20 --seed 101 [--smart 2] [--playbooks 1] [--max-usd X] [--game-budget-usd Y] [--run label]
 * With --playbooks 1 each Smart seat also writes its strategy and land-grant playbook each month (spec A C4), and the
 * report adds UBER-AC-A's edit share; without it the seats only decide move by move, as before.
 * Without the key every seat plays Classic and nothing is called. With it, real money: --max-usd is required; one
 * unlabelled run per UTC day, or one per --run label (each cleared on its own); and no run may carry the spend of every
 * trial ledger past BRAIN.proofCapUsd. Each game's Smart seats together spend at most the game budget (default
 * BRAIN.gameBudgetUsd).
 */
import fs from 'node:fs';
import path from 'node:path';
import { BRAIN, type GameState, type Playbook } from '@mule/engine';
import { playbookSource, playGameAsync, type AiSeat, ReplyRejected, simSeats, type Choice, type Decider, type DecisionRecord, type SeatSpec } from '@mule/ai';
import { alreadyRanToday, AUTH_STOPPED, claimLedger, day, dayLedgerPath, KINDS, numberFlags, resolveDeps, runAsScript, type MainDeps } from './cli.js';
import { CallFailed } from './client.js';
import { API_KEY_ENV, apiKeyFrom, createBrain, type BrainSeat } from './index.js';
import { isCallLine, readLedgerLines, type CallLine } from './ledger.js';
import { Playbooks } from './playbooks.js';
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
  gameBudgetUsd: number;
  /** Whether the Smart seats write their playbooks. */
  playbooks: boolean;
  out: (line: string) => void;
}

/** Adds one to `counts[month - 1]`. */
const bump = (counts: number[], month: number) => {
  counts[month - 1] = (counts[month - 1] ?? 0) + 1;
};

/** Plays one game with its own brain; pauses simulated time while a model call is open, and always closes the brain. */
async function playTrialGame(setup: GameSetup): Promise<TrialGame> {
  const { id } = setup;
  const brain = createBrain({ gameId: id, env: setup.env, gameBudgetUsd: setup.gameBudgetUsd, ...(setup.logPath === null ? {} : { logPath: setup.logPath }) });
  const game: TrialGame = { id, end: 'unfinished', months: 0, smart: [], decisions: [], lines: {}, modelLines: {}, cutOff: [], countedUsd: 0, settledCalls: 0, playbooks: [] };
  // The Smart seats' playbooks (spec A C4): asked for at the start and as each upkeep ends, in effect from the land
  // grant. The strategist seats play their own drafts; in whatIf they play as the engine's Trader would.
  // The game's live state (from onSeats), and the month whose auction was last asked.
  const held: { playbooks: Playbooks | null; state: GameState | null; auctionAsked: number } = { playbooks: null, state: null, auctionAsked: -1 };
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
      onSeats: (seats, state) => {
        const smart = seats.filter((s) => game.smart.includes(s.id));
        if (!setup.playbooks || smart.length === 0) return;
        held.state = state;
        held.playbooks = new Playbooks({
          brain,
          source: playbookSource(smart),
          seats: smart,
          record: (note) => game.playbooks.push({ seat: note.seat, month: note.month, by: note.playbook.by }),
        });
        held.playbooks.ask(state, state.month);
      },
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
        // Planning ends and the land grant comes next: this month's playbook takes effect. An upkeep ends: next month's is asked.
        if (state.phase === 'planning') held.playbooks?.takeEffect(state);
        if (state.phase === 'upkeep') held.playbooks?.ask(state, state.month + 1);
      },
      // A phase's draft point, before its first tick: the development part the land write carried, and the auction's
      // edits, are taken there, as MuleGame takes them at the phase's start. Nothing else is edited here.
      ...(setup.playbooks
        ? {
            edits: (_seat: AiSeat, _draft: Playbook, state: GameState) => {
              if (state.phase === 'development' || state.phase === 'auction') held.playbooks?.takePhase(state, state.phase);
              return null;
            },
          }
        : {}),
      // Each call is bounded by its kind's wait, so this pauses simulated time for at most that long. See C6.
      between: async () => {
        if (calls.authRefused() || brain.authRefused()) throw new AuthRefused();
        // Production has run: the auction's edits are asked, as the server asks them in the production show (AM-A16),
        // and settled below before the auction opens. The development's facts stay inside the game loop, so the brief
        // has no development outcome here.
        const state = held.state;
        if (held.playbooks && state?.phase === 'production' && held.auctionAsked !== state.month) {
          held.auctionAsked = state.month;
          held.playbooks.askPhase(state, 'auction', []);
        }
        await calls.drain();
        await held.playbooks?.settle();
        if (calls.authRefused() || brain.authRefused()) throw new AuthRefused();
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
    await held.playbooks?.settle();
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
  // Decision lines only: settledCalls counts the deciders' calls, and a write's lines must never cover for a lost one.
  const written = readCalls(logPath).filter((c) => c.game === game.id && c.outcome !== 'budget' && (KINDS as readonly string[]).includes(c.kind)).length;
  if (written >= game.settledCalls) return null;
  return `Stopped: the ledger ${logPath} has ${written} of ${game.settledCalls} call lines for game ${game.id}; a write failed, so spend cannot be checked.`;
}

export interface TrialFlags {
  games: number;
  seed: number;
  smart: number;
  /** Null when not given: a paid run needs it. */
  maxUsd: number | null;
  /** The most each game's Smart seats together may spend. */
  gameBudgetUsd: number;
  /** Whether the Smart seats write their playbooks (--playbooks 1). */
  playbooks: boolean;
}

const USAGE =
  `Usage: brain:trial [--games N] [--seed S] [--smart K] [--playbooks 0|1] [--max-usd X] [--game-budget-usd Y] [--run label], ` +
  `Y above 0 and at most ${BRAIN.gameBudgetUsd.toFixed(2)}; nothing played.`;

/** A run label: lowercase letters, digits and dashes, so it can only name a file in the data folder. */
const LABEL = /^[a-z0-9-]{1,32}$/;

/** `--run <label>` taken out of the flags: the label, null when not given, or undefined for a bad one. */
function runLabel(argv: readonly string[]): { label: string | null; rest: readonly string[] } | undefined {
  const at = argv.indexOf('--run');
  if (at < 0) return { label: null, rest: argv };
  const label = argv[at + 1];
  if (label === undefined || !LABEL.test(label) || argv.indexOf('--run', at + 1) >= 0) return undefined;
  return { label, rest: [...argv.slice(0, at), ...argv.slice(at + 2)] };
}

/** A paid run's ledger: trial-<day>.jsonl, or trial-<day>-<label>.jsonl for a labelled run. */
export function trialLedgerPath(dataDir: string, at: Date, label: string | null): string {
  return label === null ? dayLedgerPath(dataDir, 'trial', at) : path.join(dataDir, `trial-${day(at)}-${label}.jsonl`);
}

/** A trial ledger that could not be read, so the spend behind the cap is unknown. */
class UnreadableLedger extends Error {
  constructor(readonly file: string) {
    super(`${file} is not a readable ledger`);
  }
}

/** What every brain:trial ledger in the data folder has spent, all days and labels: its call lines' dollars. Throws UnreadableLedger. */
export function trialSpent(dataDir: string): number {
  if (!fs.existsSync(dataDir)) return 0;
  const ledgers = fs.readdirSync(dataDir).filter((f) => /^trial-.*\.jsonl$/.test(f));
  return sum(
    ledgers.flatMap((f) => {
      const file = path.join(dataDir, f);
      try {
        return readLedgerLines(file).filter(isCallLine).map((l) => l.usd);
      } catch {
        throw new UnreadableLedger(file);
      }
    }),
  );
}

/**
 * Why a paid run with this cap may not start, or null: the trial ledgers' total plus the cap would pass
 * BRAIN.proofCapUsd, or a ledger cannot be read, so the total is unknown (fail closed).
 */
export function proofCapRefusal(dataDir: string, maxUsd: number): string | null {
  let spent: number;
  try {
    spent = trialSpent(dataDir);
  } catch (err) {
    if (err instanceof UnreadableLedger) return `brain:trial cannot check the PR-5 cap: ${err.file} is not a readable ledger; nothing called.`;
    throw err;
  }
  if (spent + maxUsd <= BRAIN.proofCapUsd) return null;
  return `brain:trial would pass the PR-5 cap: the trial ledgers hold $${spent.toFixed(5)}, --max-usd ${capText(maxUsd)}, cap ${capText(BRAIN.proofCapUsd)}; nothing called.`;
}

/** The flags, or null for anything numberFlags refuses or a value out of range. */
function parseFlags(argv: readonly string[]): TrialFlags | null {
  const given = numberFlags(argv, ['--games', '--seed', '--smart', '--playbooks', '--max-usd', '--game-budget-usd']);
  if (!given) return null;
  const flags = {
    games: given.get('--games') ?? 20,
    seed: given.get('--seed') ?? 101,
    smart: given.get('--smart') ?? 2,
    maxUsd: given.get('--max-usd') ?? null,
    gameBudgetUsd: given.get('--game-budget-usd') ?? BRAIN.gameBudgetUsd,
    playbooks: given.get('--playbooks') ?? 0,
  };
  const ok = Number.isInteger(flags.games) && flags.games >= 1 && Number.isInteger(flags.seed) && Number.isInteger(flags.smart);
  const budgetOk = flags.gameBudgetUsd > 0 && flags.gameBudgetUsd <= BRAIN.gameBudgetUsd;
  const playbooksOk = flags.playbooks === 0 || flags.playbooks === 1;
  return ok && budgetOk && playbooksOk && flags.smart >= 1 && flags.smart <= SEATS && (flags.maxUsd === null || flags.maxUsd > 0) ? { ...flags, playbooks: flags.playbooks === 1 } : null;
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
      // The brain's table check holds a game to the game budget, unknown bills included. !(<=) refuses a NaN.
      if (!(sum(games.map((g) => g.countedUsd)) + flags.gameBudgetUsd <= paid.cap)) return { games, stopped: 'cap', lostLines: null };
      // The day's clearance is used once, by the run that starts the first game.
      if (i === 0) claimLedger(paid.logPath);
    }
    const seed = flags.seed + i;
    const game = await playTrialGame({
      seed,
      id: `trial-${today}-${flags.seed}-${i}`,
      env,
      logPath: paid?.logPath ?? null,
      smart: flags.smart,
      gameBudgetUsd: flags.gameBudgetUsd,
      playbooks: flags.playbooks,
      out,
    });
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
  const run = runLabel(argv);
  const flags = run ? parseFlags(run.rest) : null;
  if (!run || !flags) {
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
    const logPath = trialLedgerPath(dataDir, at, run.label);
    const used =
      run.label === null
        ? alreadyRanToday(logPath, 'brain:trial')
        : fs.existsSync(logPath)
          ? `${logPath} exists: run "${run.label}" already ran, and each run needs its own clearance; nothing called.`
          : null;
    if (used) {
      out(used);
      return { code: 1, report: null };
    }
    // One run a day used to stop an accidental overspend; with labels, the PR-5 cap across every trial ledger does.
    const overCap = proofCapRefusal(dataDir, flags.maxUsd);
    if (overCap) {
      out(overCap);
      return { code: 1, report: null };
    }
    paid = { logPath, cap: flags.maxUsd };
    out(
      `brain:trial model ${BRAIN.model}, cap ${capText(paid.cap)}, planned ${flags.games} games with ${flags.smart} Smart seats ` +
        `(together held to ${capText(flags.gameBudgetUsd)} a game, an equal share each), ledger ${logPath}`,
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
    gameBudgetUsd: flags.gameBudgetUsd,
    games,
    calls: paid ? readCalls(paid.logPath) : [],
    playbooks: flags.playbooks,
  });
  for (const line of renderTrialReport(report)) out(line);
  if (paid && stopped === 'cap' && games.length === 0) {
    out(`No game started: cap ${capText(paid.cap)} is below one game's budget (${capText(flags.gameBudgetUsd)}).`);
  }
  if (stopped === 'auth') out(AUTH_STOPPED);
  if (lostLines) out(lostLines);
  return { code: exitCode(keyed, stopped, report), report };
}

export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: MainDeps = {}): Promise<number> {
  return (await trial(argv, env, deps)).code;
}

runAsScript(import.meta.url, 'brain:trial', main);
