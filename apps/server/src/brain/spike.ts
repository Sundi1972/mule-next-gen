/**
 * Measures Haiku's latency and cost on real decisions from one strategist game.
 * Usage: pnpm --filter @mule/server brain:spike -- --calls 50 --max-usd 0.05 --seed 101
 * Spends real money; cap = min(flag, BRAIN.spikeCapUsd); one run per day.
 */
import { AI_LEVELS, AI_PERSONAS, BRAIN, observe, type AiLevelId, type AiPersonaId, type GameState } from '@mule/engine';
import {
  buildPrompt,
  parseReply,
  PERSONAS,
  playGame,
  ReplyRejected,
  simSeats,
  situation,
  WAIT_MS,
  type DecisionContext,
  type DecisionKind,
  type Mind,
  type Prompt,
  type ShortOption,
} from '@mule/ai';
import { alreadyRanToday, AUTH_STOPPED, claimLedger, day, dayLedgerPath, KINDS, nearest, numberFlags, resolveDeps, runAsScript, table, type MainDeps, type StopReason } from './cli.js';
import { billUnknown, CallFailed, createAnthropicSdk, createHaikuComplete, type HaikuReply } from './client.js';
import { API_KEY_ENV, apiKeyFrom, outcomeOf } from './index.js';
import { promptChars, worstCaseUsd } from './budget.js';
import { createLedger, NO_USAGE, usd, type Ledger, type Outcome } from './ledger.js';

/** One real decision turned into a prompt, with what is needed to rebuild and attribute it. */
export interface SpikeItem {
  prompt: Prompt;
  kind: DecisionKind;
  seat: string;
  persona: AiPersonaId;
  level: AiLevelId;
  shortlist: ShortOption[];
  context: DecisionContext;
}

/** A percentile: an answered latency, or a rank among timed-out calls, known only to exceed a wait. */
export type Latency = { ms: number } | { overMs: number };

/** One kind's figures, or all kinds pooled (`kind: 'all'`). */
export interface KindRow {
  kind: DecisionKind | 'all';
  /** The kind's wait; null on the pooled row, where each call is judged against its own kind's wait. */
  waitMs: number | null;
  calls: number;
  timeouts: number;
  errors: number;
  /**
   * Over answered and timed-out calls, timeouts ranked slowest; errors are not timed. Null when there are none, and
   * always on the pooled row: across mixed waits a rank mixes upper and lower bounds.
   */
  p50: Latency | null;
  p90: Latency | null;
  max: Latency | null;
  /** Share of calls answered within their kind's wait; a timeout or an error is not within. */
  within: number;
  /** Calls that brought a reply back, usable or not. */
  answered: number;
  /** Share of answered calls with outcome llm: an option on the list, not refused. Null when none was answered. */
  usable: number | null;
}

export interface SpikeReport {
  planned: number;
  calls: number;
  /** Dollars the ledger charged (what the API billed). */
  ledgerUsd: number;
  /** Ledger dollars plus each call whose bill is unknown at its worst case: what the cap is checked against. */
  countedUsd: number;
  cap: number;
  /** The first call's latency whatever its outcome; 0 when nothing was called. */
  firstMs: number;
  /** One row per kind called, in KINDS order, then the pooled row. */
  kinds: KindRow[];
  refusals: number;
  unreadable: number;
  offList: number;
  authFailures: number;
  cacheRead: number;
  cacheWrite: number;
  /** Prompt characters per input token over calls that billed input; null when none did. */
  charsPerToken: { min: number; median: number; max: number } | null;
  stopped: StopReason;
}

/** A flag may lower the cap, never raise it. An unusable flag gives 0, so nothing is called. */
export function capFor(flagMaxUsd: number): number {
  return Number.isFinite(flagMaxUsd) && flagMaxUsd > 0 ? Math.min(flagMaxUsd, BRAIN.spikeCapUsd) : 0;
}

interface Collected {
  record: { id: number; seat: string; kind: DecisionKind; month: number; shortlist: ShortOption[] };
  summary: string | null;
}

/** A seat's place in the game's player list, which follows the order of the specs it was created from. */
const seatIndex = (state: GameState, seatId: string): number => state.players.findIndex((p) => p.id === seatId);

/**
 * Real prompts from one strategist game, taken round-robin by kind. The situation summary is computed from the game
 * state at the end of the phase the decision was made in, not at the instant of the decision, so it is approximate.
 */
export function collectPrompts(seed: number, calls: number): SpikeItem[] {
  const specs = simSeats(4, 'trader', seed);
  const seatOf = (state: GameState, seatId: string) => {
    const i = seatIndex(state, seatId);
    const spec = specs[i]!;
    const mind: Mind = { me: seatId, personaId: spec.persona, persona: AI_PERSONAS[spec.persona], levelId: spec.level, level: AI_LEVELS[spec.level] };
    return { spec, mind, name: state.players[i]!.name };
  };
  const collected: Collected[] = [];
  const summarise = (state: GameState, c: Collected) => {
    c.summary = situation(observe(state, c.record.seat), seatOf(state, c.record.seat).mind);
  };
  const { state: final } = playGame(seed, specs, {
    onDecision: (r) => {
      // Brain.ask asks the model only when there is a choice to make.
      if (r.shortlist.length >= 2) collected.push({ record: r, summary: null });
    },
    onPhase: (state) => {
      for (const c of collected) if (c.summary === null) summarise(state, c);
    },
  });
  for (const c of collected) if (c.summary === null) summarise(final, c);

  const buckets = new Map<DecisionKind, Collected[]>(KINDS.map((k) => [k, collected.filter((c) => c.record.kind === k)]));
  const picked: Collected[] = [];
  for (let round = 0; picked.length < calls; round++) {
    let took = false;
    for (const k of KINDS) {
      const c = buckets.get(k)![round];
      if (c && picked.length < calls) {
        picked.push(c);
        took = true;
      }
    }
    if (!took) break;
  }

  return picked.map((c) => {
    const { spec, mind, name } = seatOf(final, c.record.seat);
    const context: DecisionContext = {
      kind: c.record.kind,
      seat: c.record.seat,
      name,
      month: c.record.month,
      maxMonths: final.maxMonths,
      summary: c.summary ?? '',
      // buildPrompt reads neither the seed nor the tolerance.
      seed: 0,
      pickTolerance: mind.level.pickTolerance,
      tableTalk: [],
    };
    return {
      prompt: buildPrompt(c.record.shortlist, PERSONAS[spec.persona], context),
      kind: c.record.kind,
      seat: c.record.seat,
      persona: spec.persona,
      level: spec.level,
      shortlist: c.record.shortlist,
      context,
    };
  });
}

export interface SpikeOptions {
  prompts: SpikeItem[];
  complete: (prompt: Prompt, waitMs: number) => Promise<HaikuReply>;
  ledger: Ledger;
  /** Dollars a call with this prompt could cost at most. */
  worstCase: (prompt: Prompt) => number;
  /** Dollars. Callers pass capFor(flag); runSpike trusts it only up to BRAIN.spikeCapUsd. */
  cap: number;
  /** Called once, just before the first call starts; a run that calls nothing never calls it. */
  claim?: () => void;
  now: () => Date;
  log: (line: string) => void;
}

/** One settled call, as the report needs it. */
interface Settled {
  kind: DecisionKind;
  outcome: Exclude<Outcome, 'budget'>;
  ms: number;
}

const ascending = (a: number, b: number) => a - b;


const isAnswered = (s: Settled) => s.outcome !== 'timeout' && s.outcome !== 'error';

function kindRow(kind: KindRow['kind'], waitMs: number | null, settled: Settled[]): KindRow {
  const answered = settled.filter(isAnswered).map((s) => s.ms).sort(ascending);
  const timedOut = settled.filter((s) => s.outcome === 'timeout').map((s) => WAIT_MS[s.kind]).sort(ascending);
  // A timed-out call ranks slower than every answer; all that is known of its latency is that it passed its wait.
  const ranked: Latency[] = [...answered.map((ms) => ({ ms })), ...timedOut.map((overMs) => ({ overMs }))];
  const at = (q: number) => (waitMs === null || ranked.length === 0 ? null : nearest(ranked, q));
  const within = settled.filter((s) => isAnswered(s) && s.ms <= WAIT_MS[s.kind]).length;
  const usable = settled.filter((s) => s.outcome === 'llm').length;
  return {
    kind,
    waitMs,
    calls: settled.length,
    timeouts: timedOut.length,
    errors: settled.filter((s) => s.outcome === 'error').length,
    p50: at(0.5),
    p90: at(0.9),
    max: at(1),
    within: settled.length === 0 ? 0 : within / settled.length,
    answered: answered.length,
    usable: answered.length === 0 ? null : usable / answered.length,
  };
}

/** Sends the prompts one at a time and never starts a call that could take the counted spend past the cap. */
export async function runSpike(options: SpikeOptions): Promise<SpikeReport> {
  const { prompts, complete, ledger, worstCase, now, log } = options;
  const cap = Math.min(options.cap, BRAIN.spikeCapUsd);
  const game = `spike-${day(now())}`;

  let ledgerUsd = 0;
  let unknownUsd = 0;
  let authFailures = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  const settled: Settled[] = [];
  const perToken: number[] = [];
  let stopped: StopReason = 'done';

  for (const it of prompts) {
    const worst = worstCase(it.prompt);
    // Written as !(<=) so a NaN refuses instead of slipping through.
    if (!(ledgerUsd + unknownUsd + worst <= cap)) {
      stopped = 'cap';
      break;
    }
    if (settled.length === 0) options.claim?.();
    let reply: HaikuReply | null = null;
    let failure: unknown;
    try {
      reply = await complete(it.prompt, WAIT_MS[it.kind]);
      const parsed = parseReply(reply.text, it.shortlist);
      if (!parsed.ok) failure = new ReplyRejected(parsed.reason, parsed.outcome);
    } catch (e) {
      // Anything but a CallFailed is counted as an error, and its text is dropped.
      failure = e ?? new Error('unknown error');
    }
    const failed = failure instanceof CallFailed ? failure : null;
    const outcome = outcomeOf(reply, failure);
    const usage = reply?.usage ?? NO_USAGE;
    const ms = reply?.ms ?? failed?.ms ?? 0;
    const auth = failed?.auth ?? false;
    settled.push({ kind: it.kind, outcome, ms });
    ledger.record({ game, seat: it.seat, persona: it.persona, level: it.level, model: BRAIN.model, kind: it.kind, ms, outcome, ...usage });
    ledgerUsd += usd(usage);
    if (billUnknown(reply, failure)) unknownUsd += worst;
    cacheRead += usage.cached_read;
    cacheWrite += usage.cache_write;
    const tokens = usage.input + usage.cached_read + usage.cache_write;
    if (tokens > 0) perToken.push(promptChars(it.prompt) / tokens);
    if (auth) authFailures += 1;
    log(`call ${settled.length}/${prompts.length} ${it.kind} ${outcome} ${Math.round(ms)} ms, counted $${(ledgerUsd + unknownUsd).toFixed(5)}`);
    if (auth) {
      stopped = 'auth';
      break;
    }
  }
  if (settled.length > 0) ledger.finish(game);

  const count = (outcome: Settled['outcome']) => settled.filter((s) => s.outcome === outcome).length;
  const called = KINDS.filter((k) => settled.some((s) => s.kind === k));
  const ratios = [...perToken].sort(ascending);
  return {
    planned: prompts.length,
    calls: settled.length,
    ledgerUsd,
    countedUsd: ledgerUsd + unknownUsd,
    cap,
    firstMs: settled[0]?.ms ?? 0,
    kinds: [...called.map((k) => kindRow(k, WAIT_MS[k], settled.filter((s) => s.kind === k))), kindRow('all', null, settled)],
    refusals: count('refused'),
    unreadable: count('unreadable'),
    offList: count('off_list'),
    authFailures,
    cacheRead,
    cacheWrite,
    charsPerToken: ratios.length === 0 ? null : { min: ratios[0]!, median: nearest(ratios, 0.5), max: ratios[ratios.length - 1]! },
    stopped,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const latencyText = (l: Latency | null) => (l === null ? '—' : 'ms' in l ? `${Math.round(l.ms)} ms` : `> ${l.overMs} ms`);

/** A small human-readable report: totals, then one row per kind and the pooled row. */
export function renderReport(r: SpikeReport): string[] {
  const totals = table([
    ['calls made / planned', `${r.calls} / ${r.planned}`],
    ['stopped because', r.stopped],
    ['ledger spend', `$${r.ledgerUsd.toFixed(5)}`],
    [`counted spend (cap $${r.cap.toFixed(2)})`, `$${r.countedUsd.toFixed(5)}`],
    ['first-call latency', `${Math.round(r.firstMs)} ms`],
    ['refusals / auth failures', `${r.refusals} / ${r.authFailures}`],
    ['unreadable / off-list replies', `${r.unreadable} / ${r.offList}`],
    ['cache read / write tokens', `${r.cacheRead} / ${r.cacheWrite}`],
    ['chars per input token min / median / max', r.charsPerToken ? [r.charsPerToken.min, r.charsPerToken.median, r.charsPerToken.max].map((x) => x.toFixed(2)).join(' / ') : 'n/a'],
  ]);
  const kinds = table([
    ['kind', 'calls', 'timeouts', 'errors', 'p50', 'p90', 'max', 'answered in time', 'usable replies'],
    ...r.kinds.map((k) => [
      k.kind,
      String(k.calls),
      String(k.timeouts),
      String(k.errors),
      latencyText(k.p50),
      latencyText(k.p90),
      latencyText(k.max),
      `${pct(k.within)} within ${k.waitMs === null ? 'own wait' : `${k.waitMs} ms`}`,
      k.usable === null ? '—' : `${pct(k.usable)} of ${k.answered}`,
    ]),
  ]);
  return [...totals, '', ...kinds];
}

const USAGE = 'Usage: brain:spike [--calls N] [--max-usd X] [--seed S]; nothing called.';

/** The flags, or null for anything numberFlags refuses or a value out of range. */
function parseFlags(argv: readonly string[]): { calls: number; maxUsd: number; seed: number } | null {
  const given = numberFlags(argv, ['--calls', '--max-usd', '--seed']);
  if (!given) return null;
  const calls = given.get('--calls') ?? 50;
  const maxUsd = given.get('--max-usd') ?? BRAIN.spikeCapUsd;
  const seed = given.get('--seed') ?? 101;
  return Number.isInteger(calls) && calls >= 1 && maxUsd > 0 && Number.isInteger(seed) ? { calls, maxUsd, seed } : null;
}

/** Exit code: 0 done or capped, 1 nothing called (bad flags, no key, or today's run already made), 2 stopped on an auth failure. */
export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: MainDeps = {}): Promise<number> {
  const { dataDir, out, now } = resolveDeps(deps);
  const flags = parseFlags(argv);
  if (!flags) {
    out(USAGE);
    return 1;
  }
  const key = apiKeyFrom(env);
  if (!key) {
    out(`${API_KEY_ENV} is not set; nothing called.`);
    return 1;
  }
  const ledgerPath = dayLedgerPath(dataDir, 'spike', now());
  const ranToday = alreadyRanToday(ledgerPath, 'brain:spike');
  if (ranToday) {
    out(ranToday);
    return 1;
  }

  const cap = capFor(flags.maxUsd);
  const prompts = collectPrompts(flags.seed, flags.calls);
  const ledger = createLedger({ path: ledgerPath });
  out(`brain:spike model ${BRAIN.model}, cap $${cap.toFixed(2)}, planned ${prompts.length} calls, ledger ${ledgerPath}`);

  // The day's clearance is used once, by the run that starts the first call.
  const claim = () => claimLedger(ledgerPath);
  const report = await runSpike({
    prompts,
    complete: createHaikuComplete(createAnthropicSdk(key)),
    ledger,
    worstCase: worstCaseUsd,
    cap,
    claim,
    now,
    log: out,
  });
  for (const line of renderReport(report)) out(line);
  if (report.stopped === 'auth') out(AUTH_STOPPED);
  return report.stopped === 'auth' ? 2 : 0;
}

runAsScript(import.meta.url, 'brain:spike', main);
