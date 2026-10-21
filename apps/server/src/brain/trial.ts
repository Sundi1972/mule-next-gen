/**
 * The G-2 proof: Smart seats against strategist seats, reporting UBER-AC-1 and UBER-AC-2.
 * Usage: pnpm --filter @mule/server brain:trial -- --games 20 --seed 101 [--smart 2] [--max-usd X]
 * Without the key every seat plays Classic and nothing is called. With it, real money: one run per UTC day.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRAIN, grantDone, type GameState } from '@mule/engine';
import { playGameAsync, ReplyRejected, simSeats, type Choice, type Decider, type DecisionKind, type DecisionRecord, type SeatSpec } from '@mule/ai';
import { CallFailed } from './client.js';
import { API_KEY_ENV, apiKeyFrom, createBrain, type BrainSeat } from './index.js';
import type { CallLine } from './ledger.js';

const SEATS = 4;
const KINDS: DecisionKind[] = ['land', 'develop', 'trade'];

/** One AI decision, as the report needs it. */
export interface TrialDecision {
  seat: string;
  kind: DecisionKind;
  by: Choice['by'];
  /** Options on the shortlist; Brain asks the model only when there are two or more. */
  options: number;
  note?: string;
}

/** What one game left behind. */
export interface TrialGame {
  id: string;
  /** over: reached gameOver; unfinished: the phase guard ran out first; auth: stopped on a 401/403; crashed: threw. */
  end: 'over' | 'unfinished' | 'auth' | 'crashed';
  months: number;
  /** Seat ids that played Smart. */
  smart: string[];
  /** Every AI seat's decisions. */
  decisions: TrialDecision[];
  /** Per Smart seat, lines that reached the chat, indexed by month - 1. */
  lines: Record<string, number[]>;
  /** The same, counting only lines the model wrote (from decisions by 'llm'). */
  modelLines: Record<string, number[]>;
  /** Phases left open by their tick limit, e.g. "month 3 auction". */
  cutOff: string[];
  /** The game's counted spend at finish, as its seat budgets counted it. */
  countedUsd: number;
  /** Model calls that settled, as the trial saw them: each should have its ledger line. */
  settledCalls: number;
}

export type StopReason = 'done' | 'cap' | 'auth' | 'ledger';

export interface TrialInput {
  keyed: boolean;
  planned: number;
  stopped: StopReason;
  smartPerGame: number;
  /** Null without the key: nothing can be spent. */
  cap: number | null;
  games: TrialGame[];
  /** The run's call lines from its ledger file. */
  calls: Pick<CallLine, 'game' | 'seat' | 'usd' | 'outcome'>[];
}

export type FallbackReason = 'too slow' | 'busy' | 'budget' | 'off-list' | 'unreadable' | 'error';
export type Verdict = 'pass' | 'fail' | 'not proven' | 'n/a';

/** Decisions the model made, out of `of`. */
export interface Share {
  model: number;
  of: number;
}

/** Per seat-month counts: lowest, nearest-rank median, and how many are 0. */
export interface MonthCounts {
  min: number;
  median: number;
  silent: number;
}

export interface TrialReport {
  keyed: boolean;
  planned: number;
  played: number;
  stopped: StopReason;
  smartPerGame: number;
  /** Smart decisions the model was asked (two or more options), overall and per kind. */
  asked: Record<'all' | DecisionKind, Share>;
  /** Every Smart decision, single-option ones included. */
  smartAll: Share;
  /** Smart decisions that fell back, by the reason in their note. */
  fallbacks: Record<FallbackReason, number>;
  fallbacksByKind: Record<DecisionKind, Record<FallbackReason, number>>;
  /** Calls the ledger records as refused; the note reads such a reply as unreadable, or as the model's if it parsed. */
  refusedCalls: number;
  /** Lines per Smart seat-month, over finished games: every line RULE-2 lets through, templates included. */
  lines: MonthCounts & { seatMonths: number };
  /** Lines per Smart seat-month that the model wrote. */
  modelLines: MonthCounts;
  seatGameUsd: { seatGames: number; max: number; mean: number; atOrOverBudget: number };
  ledgerUsd: number;
  /** Ledger dollars plus each unknown-bill call at its worst case, as the seat budgets count: what the cap is checked against. */
  countedUsd: number;
  cap: number | null;
  stalls: { unfinished: string[]; cutOff: string[] };
  /** Every AI seat's decisions, Smart and strategist. */
  allDecisions: Share;
  /** Of those, the strategist's top pick. */
  topPicks: number;
  ac1: Verdict;
  ac2: Verdict;
}

/** The phase this state is ending, named, if its tick limit cut it off while it was still open. */
export function cutOffPhase(state: GameState): string | null {
  const open =
    (state.phase === 'landGrant' && !grantDone(state)) ||
    (state.phase === 'auction' && !!state.auction && state.auction.stage !== 'over') ||
    (state.phase === 'landAuction' && !!state.landAuction && state.landAuction.stage !== 'over');
  return open ? `month ${state.month} ${state.phase}` : null;
}

// Brain's notes: "decider too slow", "decider failed: <the decider's error>", "decider named X, not on the list".
const REASONS: Array<[FallbackReason, RegExp]> = [
  ['too slow', /too slow|timed out/],
  ['busy', /: busy$/],
  ['budget', /budget spent/],
  ['off-list', /not on the list/],
  ['unreadable', /unreadable reply/],
];

function fallbackReason(note: string | undefined): FallbackReason {
  return REASONS.find(([, pattern]) => note !== undefined && pattern.test(note))?.[0] ?? 'error';
}

const shareOf = (ds: readonly TrialDecision[]): Share => ({ model: ds.filter((d) => d.by === 'llm').length, of: ds.length });
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
/** Nearest-rank median of a non-empty list. */
const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length / 2) - 1]!;

function reasonsOf(ds: readonly TrialDecision[]): Record<FallbackReason, number> {
  const counts: Record<FallbackReason, number> = { 'too slow': 0, busy: 0, budget: 0, 'off-list': 0, unreadable: 0, error: 0 };
  for (const d of ds) if (d.by === 'fallback') counts[fallbackReason(d.note)] += 1;
  return counts;
}

function monthCounts(perMonth: readonly number[]): MonthCounts {
  if (perMonth.length === 0) return { min: 0, median: 0, silent: 0 };
  return { min: Math.min(...perMonth), median: median(perMonth), silent: perMonth.filter((n) => n === 0).length };
}

/** The figures and verdicts of a run. */
export function trialReport(input: TrialInput): TrialReport {
  const { games, calls } = input;
  const smartDecisions = games.flatMap((g) => g.decisions.filter((d) => g.smart.includes(d.seat)));
  const asked = smartDecisions.filter((d) => d.options >= 2);

  // A game cut short has a partial last month, so only finished games count seat-months.
  const finished = games.filter((g) => g.end === 'over');
  const perMonth = (of: (g: TrialGame) => Record<string, number[]>) =>
    finished.flatMap((g) => g.smart.flatMap((seat) => Array.from({ length: g.months }, (_, m) => of(g)[seat]?.[m] ?? 0)));
  const allLines = perMonth((g) => g.lines);
  const seatUsd = games.flatMap((g) => g.smart.map((seat) => sum(calls.filter((c) => c.game === g.id && c.seat === seat).map((c) => c.usd))));

  const stalls = {
    unfinished: games.filter((g) => g.end === 'unfinished' || g.end === 'crashed').map((g) => g.id),
    cutOff: games.flatMap((g) => g.cutOff.map((c) => `${g.id} ${c}`)),
  };
  const stalled = stalls.unfinished.length + stalls.cutOff.length > 0;
  const everyDecision = games.flatMap((g) => g.decisions);
  const allDecisions = shareOf(everyDecision);
  const topPicks = everyDecision.filter((d) => d.by === 'top').length;
  // A run proves an AC only when every planned game was played to its end.
  const complete = input.stopped === 'done' && games.length === input.planned && finished.length === games.length;
  const lines = { seatMonths: allLines.length, ...monthCounts(allLines) };
  const seatGameUsd = {
    seatGames: seatUsd.length,
    max: seatUsd.length === 0 ? 0 : Math.max(...seatUsd),
    mean: seatUsd.length === 0 ? 0 : sum(seatUsd) / seatUsd.length,
    atOrOverBudget: seatUsd.filter((u) => u >= BRAIN.seatBudgetUsd).length,
  };
  const all = shareOf(asked);

  // A silent seat-month, a stall or a seat-game at the budget fails outright; the rest is judged on a complete run only.
  let ac1: Verdict = 'n/a';
  let ac2: Verdict;
  if (input.keyed) {
    const shareHolds = all.of > 0 && 5 * all.model >= 4 * all.of && lines.seatMonths > 0;
    ac1 = lines.silent > 0 ? 'fail' : !complete ? 'not proven' : shareHolds ? 'pass' : 'fail';
    ac2 = stalled || seatGameUsd.atOrOverBudget > 0 ? 'fail' : !complete || seatGameUsd.seatGames === 0 ? 'not proven' : 'pass';
  } else {
    ac2 = stalled || topPicks !== allDecisions.of ? 'fail' : !complete ? 'not proven' : 'pass';
  }

  return {
    keyed: input.keyed,
    planned: input.planned,
    played: games.length,
    stopped: input.stopped,
    smartPerGame: input.smartPerGame,
    asked: { all, ...(Object.fromEntries(KINDS.map((k) => [k, shareOf(asked.filter((d) => d.kind === k))])) as Record<DecisionKind, Share>) },
    smartAll: shareOf(smartDecisions),
    fallbacks: reasonsOf(smartDecisions),
    fallbacksByKind: Object.fromEntries(KINDS.map((k) => [k, reasonsOf(smartDecisions.filter((d) => d.kind === k))])) as TrialReport['fallbacksByKind'],
    refusedCalls: calls.filter((c) => c.outcome === 'refused').length,
    lines,
    modelLines: monthCounts(perMonth((g) => g.modelLines)),
    seatGameUsd,
    ledgerUsd: sum(calls.map((c) => c.usd)),
    countedUsd: sum(games.map((g) => g.countedUsd)),
    cap: input.cap,
    stalls,
    allDecisions,
    topPicks,
    ac1,
    ac2,
  };
}

/** Rows as columns two spaces apart; the last column is not padded. */
function table(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)));
  return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]!))).join('  '));
}

// Floored, so a share just under 80% never prints as 80%.
const pct = (s: Share) => (s.of === 0 ? 'n/a' : `${(Math.floor((1000 * s.model) / s.of) / 10).toFixed(1)}% (${s.model} of ${s.of})`);
const usdText = (x: number) => `$${x.toFixed(5)}`;
/** Two decimals when that is exact, so a cap of 0.059 is not printed as $0.06. */
const capText = (x: number) => `$${Number(x.toFixed(2)) === x ? x.toFixed(2) : String(x)}`;
const verdictText = (v: Verdict) => v.toUpperCase();
const reasonsText = (f: Record<FallbackReason, number>) =>
  `too slow ${f['too slow']}, busy ${f.busy}, budget ${f.budget}, off-list ${f['off-list']}, unreadable ${f.unreadable}, error ${f.error}`;
const monthText = (c: MonthCounts, of: number) => `min ${c.min}, median ${c.median}, months with none ${c.silent} of ${of}`;

/** The report as printed: the run, UBER-AC-1, UBER-AC-2, then one verdict line per AC. */
export function renderTrialReport(r: TrialReport): string[] {
  const stallText = `games not finished ${r.stalls.unfinished.length}, phases cut off ${r.stalls.cutOff.length}`;
  const stallDetail = [...r.stalls.unfinished.map((id) => `  not finished: ${id}`), ...r.stalls.cutOff.map((c) => `  cut off: ${c}`)];
  const run = [
    ['games played / planned', `${r.played} / ${r.planned}`],
    ['stopped because', r.stopped],
  ];
  if (!r.keyed) {
    return [
      ...table([
        ...run,
        ['decisions by the model', `${r.allDecisions.model} of ${r.allDecisions.of} (every seat Classic)`],
        ["decisions by the strategist's top pick", `${r.topPicks} of ${r.allDecisions.of}`],
        ['stalls', stallText],
      ]),
      ...stallDetail,
      '',
      `UBER-AC-2 (key unset) ${verdictText(r.ac2)}: ${r.stalls.unfinished.length + r.stalls.cutOff.length} stalls, ${r.topPicks} of ${r.allDecisions.of} decisions the strategist's top pick`,
    ];
  }
  return [
    ...table([
      ...run,
      ['Smart seats per game', `${r.smartPerGame} of ${SEATS}; the rest are strategist seats`],
      ['UBER-AC-1, Smart seats', ''],
      ['model share of asked decisions', pct(r.asked.all)],
      ...KINDS.map((k) => [`  ${k}`, pct(r.asked[k])]),
      ['model share of all Smart decisions', pct(r.smartAll)],
      ['fallbacks by reason', reasonsText(r.fallbacks)],
      ...KINDS.map((k) => [`  ${k}`, reasonsText(r.fallbacksByKind[k])]),
      ['refused calls (ledger)', String(r.refusedCalls)],
      ['lines per Smart seat-month', monthText(r.lines, r.lines.seatMonths)],
      ['model-written lines per Smart seat-month', monthText(r.modelLines, r.lines.seatMonths)],
      ['UBER-AC-2', ''],
      [
        'ledger $ per Smart seat-game',
        `max ${usdText(r.seatGameUsd.max)}, mean ${usdText(r.seatGameUsd.mean)}, at or over $${BRAIN.seatBudgetUsd.toFixed(2)}: ${r.seatGameUsd.atOrOverBudget} of ${r.seatGameUsd.seatGames}`,
      ],
      ['ledger spend', usdText(r.ledgerUsd)],
      [`counted spend (cap ${capText(r.cap ?? 0)})`, usdText(r.countedUsd)],
      ['stalls', stallText],
    ]).map((l) => l.trimEnd()),
    ...stallDetail,
    '',
    `UBER-AC-1 ${verdictText(r.ac1)}: ${pct(r.asked.all)} of asked Smart decisions by the model (needs 80%), ${r.lines.silent} Smart seat-months without a line (needs 0)`,
    `UBER-AC-2 ${verdictText(r.ac2)}: at most ${usdText(r.seatGameUsd.max)} per Smart seat-game (needs under $${BRAIN.seatBudgetUsd.toFixed(2)}), ${r.stalls.unfinished.length + r.stalls.cutOff.length} stalls (needs 0)`,
  ];
}

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
  maxUsd: number;
}

const USAGE = 'Usage: brain:trial [--games N] [--seed S] [--smart K] [--max-usd X]; nothing played.';
const FLAG_NAMES = ['--games', '--seed', '--smart', '--max-usd'];
const NUMBER = /^\d+(\.\d+)?$/;

/** The flags, or null for anything else: an unknown, repeated or `--name=value` flag, a missing or non-numeric value, a stray word. */
function parseFlags(argv: readonly string[]): TrialFlags | null {
  // pnpm hands its `--` separator through to the script.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const given = new Map<string, number>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!;
    const value = args[i + 1];
    if (!FLAG_NAMES.includes(name) || given.has(name) || value === undefined || !NUMBER.test(value)) return null;
    given.set(name, Number(value));
  }
  const flags = {
    games: given.get('--games') ?? 20,
    seed: given.get('--seed') ?? 101,
    smart: given.get('--smart') ?? 2,
    maxUsd: given.get('--max-usd') ?? BRAIN.spikeCapUsd,
  };
  const ok = Number.isInteger(flags.games) && flags.games >= 1 && Number.isInteger(flags.seed) && Number.isInteger(flags.smart);
  return ok && flags.smart >= 1 && flags.smart <= SEATS && flags.maxUsd > 0 ? flags : null;
}

/** Seams for tests: where the ledger goes, the clock and where lines go. Defaults are the real ones. */
export interface TrialDeps {
  dataDir?: string;
  out?: (line: string) => void;
  now?: () => Date;
}

const DATA_DIR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'data');
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Runs the trial and prints its report. Exit code with the key: 0 done or capped, 1 bad flags, today's run already
 * made or a ledger write lost, 2 stopped on an auth failure. Without it: 0 when every game finished unstalled and
 * all-Classic, otherwise 1.
 */
export async function trial(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  deps: TrialDeps = {},
): Promise<{ code: number; report: TrialReport | null }> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const flags = parseFlags(argv);
  if (!flags) {
    out(USAGE);
    return { code: 1, report: null };
  }
  const keyed = apiKeyFrom(env) !== null;
  const today = day((deps.now ?? (() => new Date()))());
  const logPath = keyed ? path.join(deps.dataDir ?? DATA_DIR, `trial-${today}.jsonl`) : null;
  const cap = keyed ? flags.maxUsd : null;

  if (logPath === null) {
    out(`${API_KEY_ENV} is not set: every seat plays Classic and nothing is called.`);
  } else if (fs.existsSync(logPath)) {
    out(`${logPath} exists: brain:trial already ran today, and each paid run needs its own clearance; nothing called.`);
    return { code: 1, report: null };
  } else {
    out(
      `brain:trial model ${BRAIN.model}, cap ${capText(flags.maxUsd)}, planned ${flags.games} games with ${flags.smart} Smart seats ` +
        `(each held to $${BRAIN.seatBudgetUsd.toFixed(2)} a game), ledger ${logPath}`,
    );
  }

  const games: TrialGame[] = [];
  let stopped: StopReason = 'done';
  let lostLines = '';
  for (let i = 0; i < flags.games; i++) {
    if (logPath !== null && cap !== null) {
      const counted = sum(games.map((g) => g.countedUsd));
      // Each Smart seat's budget holds its game to BRAIN.seatBudgetUsd, unknown bills included. !(<=) refuses a NaN.
      if (!(counted + flags.smart * BRAIN.seatBudgetUsd <= cap)) {
        stopped = 'cap';
        break;
      }
      // 'wx' creates the file or fails: the day's clearance is used once, by the run that starts the first game.
      if (i === 0) {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.closeSync(fs.openSync(logPath, 'wx'));
      }
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
    out(`No game started: cap ${capText(flags.maxUsd)} is below one game's Smart budgets ($${(flags.smart * BRAIN.seatBudgetUsd).toFixed(2)}).`);
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

export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: TrialDeps = {}): Promise<number> {
  return (await trial(argv, env, deps)).code;
}

/** Whether this module is the script Node was started with; never throws, so importing it is always safe. */
function isMainModule(): boolean {
  const invokedAs = process.argv[1];
  if (invokedAs === undefined) return false;
  try {
    // realpath: Node resolves the main module through links.
    return import.meta.url === pathToFileURL(fs.realpathSync(invokedAs)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    () => {
      console.error('brain:trial failed before finishing.');
      process.exit(1);
    },
  );
}
