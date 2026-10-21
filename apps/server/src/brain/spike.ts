/**
 * brain:spike (Spike S1): measures Haiku's latency and cost on real decisions from one strategist game.
 *
 *   pnpm --filter @mule/server brain:spike -- --calls 50 --max-usd 0.05 --seed 101
 *
 * It spends real money, so it is run by a person who has cleared it, never by tests (tests pass fakes).
 * The cap is a hard ceiling in code (AM-1): --max-usd can lower it, never raise it above BRAIN.spikeCapUsd.
 * One run per clearance (AM-10): it refuses to start when today's ledger already exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AI_LEVELS, AI_PERSONAS, BRAIN, observe, type AiLevelId, type AiPersonaId, type GameState } from '@mule/engine';
import {
  buildPrompt,
  PERSONAS,
  playGame,
  simSeats,
  situation,
  WAIT_MS,
  type DecisionContext,
  type DecisionKind,
  type Mind,
  type Prompt,
  type ShortOption,
} from '@mule/ai';
import { CallFailed, createAnthropicSdk, createHaikuComplete, type HaikuReply } from './client.js';
import { API_KEY_ENV, apiKeyFrom } from './index.js';
import { createBudget, type Budget } from './budget.js';
import { createLedger, usd, type Ledger, type Usage } from './ledger.js';

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

export type StopReason = 'done' | 'cap' | 'auth';

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
}

export interface SpikeReport {
  planned: number;
  calls: number;
  /** Dollars the ledger charged (what the API billed). */
  ledgerUsd: number;
  /** Ledger dollars plus each call whose bill is unknown at its worst case (AM-10): what the cap is checked against. */
  countedUsd: number;
  cap: number;
  /** The first call's latency whatever its outcome (AM-8); 0 when nothing was called. */
  firstMs: number;
  /** One row per kind called, in KINDS order, then the pooled row. */
  kinds: KindRow[];
  refusals: number;
  authFailures: number;
  cacheRead: number;
  cacheWrite: number;
  /** Prompt characters per input token over calls that billed input; null when none did. */
  charsPerToken: { min: number; median: number; max: number } | null;
  stopped: StopReason;
}

/** AM-1: a flag may lower the cap, never raise it. An unusable flag gives 0, so nothing is called. */
export function capFor(flagMaxUsd: number): number {
  return Number.isFinite(flagMaxUsd) && flagMaxUsd > 0 ? Math.min(flagMaxUsd, BRAIN.spikeCapUsd) : 0;
}

const KINDS: DecisionKind[] = ['land', 'develop', 'trade'];

interface Collected {
  record: { id: number; seat: string; kind: DecisionKind; month: number; shortlist: ShortOption[] };
  summary: string | null;
}

/**
 * Real prompts from one strategist game, taken round-robin by kind. The situation summary is computed from the game
 * state at the end of the phase the decision was made in (not the instant of the decision): approximate, as agreed.
 */
export function collectPrompts(seed: number, calls: number): SpikeItem[] {
  const specs = simSeats(4, 'trader', seed);
  const mindOf = (i: number): Mind => ({
    me: `ai${i}`,
    personaId: specs[i]!.persona,
    persona: AI_PERSONAS[specs[i]!.persona],
    levelId: specs[i]!.level,
    level: AI_LEVELS[specs[i]!.level],
  });
  const collected: Collected[] = [];
  let last: GameState | null = null;
  const summarise = (state: GameState, c: Collected) => {
    const i = Number(c.record.seat.slice(2));
    c.summary = situation(observe(state, c.record.seat), mindOf(i));
  };
  playGame(seed, specs, {
    onDecision: (r) => {
      if (r.shortlist.length > 0) collected.push({ record: r, summary: null });
    },
    onPhase: (state) => {
      last = state;
      for (const c of collected) if (c.summary === null) summarise(state, c);
    },
  });
  if (last) for (const c of collected) if (c.summary === null) summarise(last, c);

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

  const maxMonths = last ? observe(last, 'ai0').maxMonths : 0;
  return picked.map((c) => {
    const i = Number(c.record.seat.slice(2));
    const mind = mindOf(i);
    const context: DecisionContext = {
      kind: c.record.kind,
      seat: c.record.seat,
      name: `AI ${i + 1}`,
      month: c.record.month,
      maxMonths,
      summary: c.summary ?? '',
      seed: (seed * 2_654_435_761 + c.record.id * 40_503 + c.record.month * 977) >>> 0,
      pickTolerance: mind.level.pickTolerance,
      tableTalk: [],
    };
    return {
      prompt: buildPrompt(c.record.shortlist, PERSONAS[specs[i]!.persona], context),
      kind: c.record.kind,
      seat: c.record.seat,
      persona: specs[i]!.persona,
      level: specs[i]!.level,
      shortlist: c.record.shortlist,
      context,
    };
  });
}

export interface SpikeOptions {
  prompts: SpikeItem[];
  complete: (prompt: Prompt, waitMs: number) => Promise<HaikuReply>;
  ledger: Ledger;
  budget: Pick<Budget, 'worstCase'>;
  /** Dollars. Callers pass capFor(flag); runSpike trusts it only up to BRAIN.spikeCapUsd. */
  cap: number;
  now: () => Date;
  log: (line: string) => void;
}

/** One settled call, as the report needs it. */
interface Settled {
  kind: DecisionKind;
  outcome: 'llm' | 'refused' | 'timeout' | 'error';
  ms: number;
}

const NO_USAGE: Usage = { input: 0, cached_read: 0, cache_write: 0, output: 0 };
const ascending = (a: number, b: number) => a - b;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Nearest-rank quantile of a non-empty ascending list. */
const nearest = <T>(sorted: readonly T[], q: number): T => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;

const isAnswered = (s: Settled) => s.outcome === 'llm' || s.outcome === 'refused';

function kindRow(kind: KindRow['kind'], waitMs: number | null, settled: Settled[]): KindRow {
  const answered = settled.filter(isAnswered).map((s) => s.ms).sort(ascending);
  const timedOut = settled.filter((s) => s.outcome === 'timeout').map((s) => WAIT_MS[s.kind]).sort(ascending);
  // A timed-out call ranks slower than every answer; all that is known of its latency is that it passed its wait.
  const ranked: Latency[] = [...answered.map((ms) => ({ ms })), ...timedOut.map((overMs) => ({ overMs }))];
  const at = (q: number) => (waitMs === null || ranked.length === 0 ? null : nearest(ranked, q));
  const within = settled.filter((s) => isAnswered(s) && s.ms <= WAIT_MS[s.kind]).length;
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
  };
}

/** Sends the prompts one at a time and never starts a call that could take the counted spend past the cap. */
export async function runSpike(options: SpikeOptions): Promise<SpikeReport> {
  const { prompts, complete, ledger, budget, now, log } = options;
  const cap = Math.min(options.cap, BRAIN.spikeCapUsd);
  const game = `spike-${day(now())}`;

  let ledgerUsd = 0;
  let unknownUsd = 0;
  let refusals = 0;
  let authFailures = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  const settled: Settled[] = [];
  const perToken: number[] = [];
  let stopped: StopReason = 'done';

  for (const it of prompts) {
    const worst = budget.worstCase(it.prompt);
    // Written as !(<=) so a NaN refuses instead of slipping through.
    if (!(ledgerUsd + unknownUsd + worst <= cap)) {
      stopped = 'cap';
      break;
    }
    let outcome: Settled['outcome'];
    let usage: Usage;
    let ms: number;
    let auth = false;
    let billUnknown = false;
    try {
      const r = await complete(it.prompt, WAIT_MS[it.kind]);
      outcome = r.stopReason === 'refusal' ? 'refused' : 'llm';
      usage = r.usage;
      ms = r.ms;
    } catch (e) {
      // CallFailed carries our own short message; anything else is counted as an error and its text is dropped.
      const failed = e instanceof CallFailed ? e : null;
      outcome = failed?.outcome ?? 'error';
      usage = failed?.usage ?? NO_USAGE;
      ms = failed?.ms ?? 0;
      auth = failed?.auth ?? false;
      // Only an HTTP status shows the API answered and billed nothing; a timeout or a lost connection may be billed.
      billUnknown = failed === null || failed.status === null;
    }
    settled.push({ kind: it.kind, outcome, ms });
    ledger.record({ game, seat: it.seat, persona: it.persona, level: it.level, model: BRAIN.model, kind: it.kind, ms, outcome, ...usage });
    ledgerUsd += usd(usage);
    if (billUnknown) unknownUsd += worst;
    cacheRead += usage.cached_read;
    cacheWrite += usage.cache_write;
    const tokens = usage.input + usage.cached_read + usage.cache_write;
    if (tokens > 0) perToken.push((it.prompt.system.length + it.prompt.user.length + JSON.stringify(it.prompt.schema).length) / tokens);
    if (outcome === 'refused') refusals += 1;
    if (auth) authFailures += 1;
    log(`call ${settled.length}/${prompts.length} ${it.kind} ${outcome} ${Math.round(ms)} ms, counted $${(ledgerUsd + unknownUsd).toFixed(5)}`);
    if (auth) {
      stopped = 'auth';
      break;
    }
  }
  ledger.finish(game);

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
    refusals,
    authFailures,
    cacheRead,
    cacheWrite,
    charsPerToken: ratios.length === 0 ? null : { min: ratios[0]!, median: nearest(ratios, 0.5), max: ratios[ratios.length - 1]! },
    stopped,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const latencyText = (l: Latency | null) => (l === null ? '—' :'ms' in l ? `${Math.round(l.ms)} ms` : `> ${l.overMs} ms`);

/** Rows as columns two spaces apart; the last column is not padded. */
function table(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)));
  return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]!))).join('  '));
}

/** A small human-readable report: totals, then one row per kind and the pooled row. */
export function renderReport(r: SpikeReport): string[] {
  const totals = table([
    ['calls made / planned', `${r.calls} / ${r.planned}`],
    ['stopped because', r.stopped],
    ['ledger spend', `$${r.ledgerUsd.toFixed(5)}`],
    [`counted spend (cap $${r.cap.toFixed(2)})`, `$${r.countedUsd.toFixed(5)}`],
    ['first-call latency', `${Math.round(r.firstMs)} ms`],
    ['refusals / auth failures', `${r.refusals} / ${r.authFailures}`],
    ['cache read / write tokens', `${r.cacheRead} / ${r.cacheWrite}`],
    ['chars per input token min / median / max', r.charsPerToken ? [r.charsPerToken.min, r.charsPerToken.median, r.charsPerToken.max].map((x) => x.toFixed(2)).join(' / ') : 'n/a'],
  ]);
  const kinds = table([
    ['kind', 'calls', 'timeouts', 'errors', 'p50', 'p90', 'max', 'answered in time'],
    ...r.kinds.map((k) => [
      k.kind,
      String(k.calls),
      String(k.timeouts),
      String(k.errors),
      latencyText(k.p50),
      latencyText(k.p90),
      latencyText(k.max),
      `${pct(k.within)} within ${k.waitMs === null ? 'own wait' : `${k.waitMs} ms`}`,
    ]),
  ]);
  return [...totals, '', ...kinds];
}

/** Seams for tests: where the ledger goes, the clock and where lines go. Defaults are the real ones. */
export interface MainDeps {
  dataDir?: string;
  out?: (line: string) => void;
  now?: () => Date;
}

const DATA_DIR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'data');
const USAGE = 'Usage: brain:spike [--calls N] [--max-usd X] [--seed S]; nothing called.';
const FLAG_NAMES = ['--calls', '--max-usd', '--seed'];
const NUMBER = /^\d+(\.\d+)?$/;

/** The flags, or null for anything else: an unknown, repeated or `--name=value` flag, a missing or non-numeric value, a stray word. */
function parseFlags(argv: readonly string[]): { calls: number; maxUsd: number; seed: number } | null {
  // pnpm hands its `--` separator through to the script.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const given = new Map<string, number>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!;
    const value = args[i + 1];
    if (!FLAG_NAMES.includes(name) || given.has(name) || value === undefined || !NUMBER.test(value)) return null;
    given.set(name, Number(value));
  }
  const calls = given.get('--calls') ?? 50;
  const maxUsd = given.get('--max-usd') ?? BRAIN.spikeCapUsd;
  const seed = given.get('--seed') ?? 101;
  return Number.isInteger(calls) && calls >= 1 && maxUsd > 0 && Number.isInteger(seed) ? { calls, maxUsd, seed } : null;
}

/** Exit code: 0 done or capped, 1 nothing called (bad flags, no key, or today's run already made), 2 stopped on an auth failure. */
export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: MainDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
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
  const now = deps.now ?? (() => new Date());
  const ledgerPath = path.join(deps.dataDir ?? DATA_DIR, `spike-${day(now())}.jsonl`);
  if (fs.existsSync(ledgerPath)) {
    out(`${ledgerPath} exists: brain:spike already ran today, and each run needs its own clearance; nothing called.`);
    return 1;
  }

  const cap = capFor(flags.maxUsd);
  const prompts = collectPrompts(flags.seed, flags.calls);
  const ledger = createLedger({ path: ledgerPath });
  out(`brain:spike model ${BRAIN.model}, cap $${cap.toFixed(2)}, planned ${prompts.length} calls, ledger ${ledgerPath}`);

  const report = await runSpike({
    prompts,
    complete: createHaikuComplete(createAnthropicSdk(key)),
    ledger,
    budget: createBudget(ledger),
    cap,
    now,
    log: out,
  });
  for (const line of renderReport(report)) out(line);
  if (report.stopped === 'auth') out('Stopped: the API refused the credentials (401/403). Nothing more was called.');
  return report.stopped === 'auth' ? 2 : 0;
}

// Runs only as the script itself, never when a test imports it. realpath: Node resolves the main module through links.
const invokedAs = process.argv[1];
if (invokedAs !== undefined && import.meta.url === pathToFileURL(fs.realpathSync(invokedAs)).href) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    () => {
      console.error('brain:spike failed before finishing.');
      process.exit(1);
    },
  );
}
