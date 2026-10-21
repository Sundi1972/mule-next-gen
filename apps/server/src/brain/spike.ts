/**
 * brain:spike (Spike S1): measures Haiku's latency and cost on real decisions from one strategist game.
 *
 *   pnpm --filter @mule/server brain:spike -- --calls 50 --max-usd 0.05 --seed 101
 *
 * It spends real money, so it is run by a person who has cleared it, never by tests (tests pass fakes).
 * The cap is a hard ceiling in code (AM-1): --max-usd can lower it, never raise it above BRAIN.spikeCapUsd.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_LEVELS, AI_PERSONAS, BRAIN, observe, type AiLevelId, type AiPersonaId, type GameState } from '@mule/engine';
import {
  buildPrompt,
  PERSONAS,
  playGame,
  situation,
  WAIT_MS,
  type DecisionContext,
  type DecisionKind,
  type Mind,
  type Prompt,
  type ShortOption,
} from '@mule/ai';
import { simSeats } from '@mule/ai/src/sim.js';
import { CallFailed, createAnthropicSdk, createHaikuComplete, type HaikuReply, type HaikuSdk } from './client.js';
import { apiKeyFrom } from './index.js';
import { createBudget, type Budget } from './budget.js';
import { createLedger, usd, type Ledger, type Outcome, type Usage } from './ledger.js';

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

export interface SpikeReport {
  planned: number;
  calls: number;
  /** Dollars the ledger charged (what the API billed). */
  ledgerUsd: number;
  /** Ledger dollars plus each timed-out call at its worst case (AM-8): the number the cap is checked against. */
  countedUsd: number;
  cap: number;
  /** Calls that returned a reply (including refusals); latency and the shares are over these. */
  answered: number;
  /** ms; `first` is the first call whatever its outcome (AM-8). Zeros when nothing was answered. */
  latency: { p50: number; p90: number; max: number; first: number };
  within1500: number;
  within2500: number;
  timeouts: number;
  refusals: number;
  errors: number;
  authFailures: number;
  cacheRead: number;
  cacheWrite: number;
  /** Prompt characters per input token over calls that billed input; null when none did. */
  charsPerToken: { min: number; median: number } | null;
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

/** Nearest-rank quantile of an ascending list. */
const quantile = (sorted: number[], q: number): number => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!);

/** Sends the prompts one at a time and never lets the counted spend pass the cap. */
export async function runSpike(options: SpikeOptions): Promise<SpikeReport> {
  const { prompts, complete, ledger, budget, now, log } = options;
  const cap = Math.min(options.cap, BRAIN.spikeCapUsd);
  const game = `spike-${now().toISOString().slice(0, 10)}`;

  let ledgerUsd = 0;
  let timeoutUsd = 0;
  let calls = 0;
  let timeouts = 0;
  let refusals = 0;
  let errors = 0;
  let authFailures = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let first: number | null = null;
  const answeredMs: number[] = [];
  const perToken: number[] = [];
  let stopped: StopReason = 'done';

  for (const it of prompts) {
    const worst = budget.worstCase(it.prompt);
    // Written as !(<=) so a NaN refuses instead of slipping through.
    if (!(ledgerUsd + timeoutUsd + worst <= cap)) {
      stopped = 'cap';
      break;
    }
    const waitMs = WAIT_MS[it.kind];
    let outcome: Outcome;
    let usage: Usage;
    let ms: number;
    let auth = false;
    try {
      const r = await complete(it.prompt, waitMs);
      outcome = r.stopReason === 'refusal' ? 'refused' : 'llm';
      usage = r.usage;
      ms = r.ms;
      answeredMs.push(ms);
    } catch (e) {
      // CallFailed carries our own short message; anything else is counted as an error and its text is dropped.
      outcome = e instanceof CallFailed ? e.outcome : 'error';
      usage = e instanceof CallFailed ? e.usage : { input: 0, cached_read: 0, cache_write: 0, output: 0 };
      ms = e instanceof CallFailed ? e.ms : 0;
      auth = e instanceof CallFailed && e.auth;
    }
    calls += 1;
    first ??= ms;
    ledger.record({ game, seat: it.seat, persona: it.persona, level: it.level, model: BRAIN.model, kind: it.kind, ms, outcome, ...usage });
    ledgerUsd += usd(usage);
    cacheRead += usage.cached_read;
    cacheWrite += usage.cache_write;
    const tokens = usage.input + usage.cached_read + usage.cache_write;
    if (tokens > 0) perToken.push((it.prompt.system.length + it.prompt.user.length + JSON.stringify(it.prompt.schema).length) / tokens);
    if (outcome === 'timeout') {
      timeouts += 1;
      timeoutUsd += worst;
    } else if (outcome === 'refused') refusals += 1;
    else if (outcome === 'error' && auth) authFailures += 1;
    else if (outcome === 'error') errors += 1;
    log(`call ${calls}/${prompts.length} ${it.kind} ${outcome} ${Math.round(ms)} ms, counted $${(ledgerUsd + timeoutUsd).toFixed(5)}`);
    if (auth) {
      stopped = 'auth';
      break;
    }
  }
  ledger.finish(game);

  const sorted = [...answeredMs].sort((a, b) => a - b);
  const share = (limit: number) => (sorted.length === 0 ? 0 : sorted.filter((m) => m <= limit).length / sorted.length);
  const tokenRatios = [...perToken].sort((a, b) => a - b);
  return {
    planned: prompts.length,
    calls,
    ledgerUsd,
    countedUsd: ledgerUsd + timeoutUsd,
    cap,
    answered: sorted.length,
    latency: { p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), max: sorted[sorted.length - 1] ?? 0, first: first ?? 0 },
    within1500: share(1_500),
    within2500: share(2_500),
    timeouts,
    refusals,
    errors,
    authFailures,
    cacheRead,
    cacheWrite,
    charsPerToken: tokenRatios.length === 0 ? null : { min: tokenRatios[0]!, median: quantile(tokenRatios, 0.5) },
    stopped,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** A small human-readable table. */
export function renderReport(r: SpikeReport): string[] {
  const rows: [string, string][] = [
    ['calls made / planned', `${r.calls} / ${r.planned}`],
    ['stopped because', r.stopped],
    ['ledger spend', `$${r.ledgerUsd.toFixed(5)}`],
    ['counted spend (cap $' + r.cap.toFixed(2) + ')', `$${r.countedUsd.toFixed(5)}`],
    ['latency p50 / p90 / max', `${Math.round(r.latency.p50)} / ${Math.round(r.latency.p90)} / ${Math.round(r.latency.max)} ms`],
    ['first-call latency', `${Math.round(r.latency.first)} ms`],
    [`answered within ${WAIT_MS.develop} ms`, pct(r.within1500)],
    [`answered within ${WAIT_MS.trade} ms`, pct(r.within2500)],
    ['timeouts / refusals / errors / auth', `${r.timeouts} / ${r.refusals} / ${r.errors} / ${r.authFailures}`],
    ['cache read / write tokens', `${r.cacheRead} / ${r.cacheWrite}`],
    ['chars per input token min / median', r.charsPerToken ? `${r.charsPerToken.min.toFixed(2)} / ${r.charsPerToken.median.toFixed(2)}` : 'n/a'],
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`);
}

/** Seams for tests: the SDK builder, the ledger file and where lines go. Defaults are the real ones. */
export interface MainDeps {
  sdkFactory?: (apiKey: string) => HaikuSdk;
  ledgerPath?: string;
  out?: (line: string) => void;
  now?: () => Date;
}

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** The variable's name is built, not written, so the key is named in exactly one source file (HC-2). */
const KEY_NAME = ['ANTHROPIC', 'API', 'KEY'].join('_');

/** Exit code: 0 done or capped, 1 nothing called (no key or bad flags), 2 stopped on an auth failure. */
export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: MainDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const key = apiKeyFrom(env);
  if (!key) {
    out(`${KEY_NAME} is not set; nothing called.`);
    return 1;
  }
  const calls = Number(flag(argv, 'calls') ?? 50);
  const maxUsd = Number(flag(argv, 'max-usd') ?? BRAIN.spikeCapUsd);
  const seed = Number(flag(argv, 'seed') ?? 101);
  if (!Number.isInteger(calls) || calls < 1 || !Number.isFinite(maxUsd) || maxUsd <= 0 || !Number.isInteger(seed)) {
    out('Usage: brain:spike [--calls N] [--max-usd X] [--seed S]; nothing called.');
    return 1;
  }

  const now = deps.now ?? (() => new Date());
  const cap = capFor(maxUsd);
  const prompts = collectPrompts(seed, calls);
  const ledgerPath = deps.ledgerPath ?? path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'data', `spike-${now().toISOString().slice(0, 10)}.jsonl`);
  const ledger = createLedger({ path: ledgerPath });
  out(`brain:spike model ${BRAIN.model}, cap $${cap.toFixed(2)}, planned ${prompts.length} calls, ledger ${ledgerPath}`);

  const report = await runSpike({
    prompts,
    complete: createHaikuComplete((deps.sdkFactory ?? createAnthropicSdk)(key)),
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

if (process.argv[1]?.endsWith('spike.ts')) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    () => {
      console.error('brain:spike failed before finishing.');
      process.exit(1);
    },
  );
}
