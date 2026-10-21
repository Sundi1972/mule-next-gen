/** The trial's figures and verdicts from what its games left behind: pure, so the tests read the report itself. */
import { BRAIN, grantDone, type GameState } from '@mule/engine';
import type { Choice, DecisionKind } from '@mule/ai';
import { table, type StopReason } from './cli.js';
import type { CallLine } from './ledger.js';

/** AI seats per trial game. */
export const SEATS = 4;
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

/** Why a run stopped: the commands' reasons, or a ledger write that was lost. */
export type TrialStop = StopReason | 'ledger';

export interface TrialInput {
  keyed: boolean;
  planned: number;
  stopped: TrialStop;
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
  stopped: TrialStop;
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

/** The reason a fallback decision's note gives. */
export function fallbackReason(note: string | undefined): FallbackReason {
  return REASONS.find(([, pattern]) => note !== undefined && pattern.test(note))?.[0] ?? 'error';
}

const shareOf = (ds: readonly TrialDecision[]): Share => ({ model: ds.filter((d) => d.by === 'llm').length, of: ds.length });
export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
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

// Floored, so a share just under 80% never prints as 80%.
const pct = (s: Share) => (s.of === 0 ? 'n/a' : `${(Math.floor((1000 * s.model) / s.of) / 10).toFixed(1)}% (${s.model} of ${s.of})`);
const usdText = (x: number) => `$${x.toFixed(5)}`;
/** Two decimals when that is exact, so a cap of 0.059 is not printed as $0.06. */
export const capText = (x: number) => `$${Number(x.toFixed(2)) === x ? x.toFixed(2) : String(x)}`;
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
