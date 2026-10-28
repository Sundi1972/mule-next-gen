import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAIN, observe, type GameState } from '@mule/engine';
import { PERSONAS, playGame, simSeats, situation, WAIT_MS, type DecisionRecord, type Prompt, type ShortOption } from '@mule/ai';
import { CallFailed, createHaikuComplete, type HaikuReply } from '../src/brain/client.js';
import { worstCaseUsd } from '../src/brain/budget.js';
import { createLedger } from '../src/brain/ledger.js';
import { capFor, collectPrompts, main, renderReport, runSpike, type SpikeItem } from '../src/brain/spike.js';
import { fakeSdk, KEY, promptOf, readLedger, sdkMessage, worstUsdOf, type SdkModuleFake } from './brain-fakes.js';

/** The SDK module's client: records its options and answers through `sdk.create`; it never reaches the network. */
const sdk = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdk));
const TODAY = new Date('2026-10-21T00:00:00Z');

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-spike-'));
  file = path.join(dir, 'spike-2026-10-21.jsonl');
  sdk.built = [];
  sdk.create = null;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const SYSTEM = 300;
const USER = 600;
const prompt = (system = SYSTEM): Prompt => ({ system: 's'.repeat(system), user: 'u'.repeat(USER), schema: { type: 'object' } as Prompt['schema'] });
const SCHEMA_CHARS = JSON.stringify({ type: 'object' }).length;

const option = (id: string): ShortOption => ({ id, key: id.toLowerCase(), label: `Option ${id}`, utility: 0.5, value: 1, rationale: 'fits' });
const SHORTLIST = [option('A'), option('B')];

// The context only feeds buildPrompt, which these fixtures replace with a prompt of a chosen size.
const item = (n: number, system = SYSTEM, kind: SpikeItem['kind'] = 'develop'): SpikeItem =>
  ({ prompt: prompt(system), kind, seat: `ai${n % 4}`, persona: 'trader', level: 'trader', shortlist: SHORTLIST }) as SpikeItem;
const items = (n: number, system = SYSTEM) => Array.from({ length: n }, (_, i) => item(i, system));

/** RULE-3's worst case for a prompt of `system` chars. */
const worstOf = (system: number): number => worstUsdOf(system + USER + SCHEMA_CHARS);

const USABLE = '{"option":"A","line":"Mine."}';
const reply = (ms: number, billed: Partial<HaikuReply['usage']> = {}, stopReason: HaikuReply['stopReason'] = 'end_turn', text = USABLE): HaikuReply => ({
  text,
  ms,
  stopReason,
  usage: { input: 100, cached_read: 10, cache_write: 5, output: 20, ...billed },
});
const timedOut = (kind: SpikeItem['kind'] = 'develop') => new CallFailed('model call timed out', 'timeout', false, WAIT_MS[kind]);

const run = (list: SpikeItem[], complete: (p: Prompt, waitMs: number) => Promise<HaikuReply>, cap: number = BRAIN.spikeCapUsd, at = file) => {
  const ledger = createLedger({ path: at, clock: () => TODAY });
  return runSpike({ prompts: list, complete, ledger, worstCase: worstCaseUsd, cap, now: () => TODAY, log: () => {} });
};
const ledgerLines = (at = file) => readLedger(at).filter((l) => l.type !== 'game'); // the closing total line is not a call

/** The real client over an SDK whose every call fails with `error()`. */
const failing = (error: () => unknown) =>
  createHaikuComplete(
    fakeSdk(() => {
      throw error();
    }),
  );

/** A usable SDK reply with a small bill. */
const usableReply = () => Promise.resolve(sdkMessage(USABLE, { input: 120, output: 20 }));

/** One line per prefix: the report row that starts with it. */
const rowOf = (lines: string[], start: string) => lines.find((l) => l.startsWith(`${start} `));

// Local only (MULE_FULL=1, `pnpm test:full`): brain:spike is a command run by hand, and only with the PM's clearance.
describe.runIf(process.env.MULE_FULL === '1')('brain:spike', () => {
  it('INV-spike-cap: a cap above BRAIN.spikeCapUsd is clamped, and the run stops at the first call whose worst case would pass it', async () => {
    expect(capFor(1)).toBe(BRAIN.spikeCapUsd);
    expect(capFor(0.01)).toBe(0.01);
    // Each prompt's worst case prices about 270,000 chars as a cache write; the fake bills 90,000 plain input tokens.
    const p = BRAIN.pricesPerMTok;
    const billed = (90_000 * p.input + 20 * p.output) / 1_000_000;
    const worst = worstOf(270_000);
    const waits: number[] = [];
    const report = await run(items(40, 270_000), async (_p, w) => (waits.push(w), reply(100, { input: 90_000, cached_read: 0, cache_write: 0 })), 1);
    expect(report.cap).toBe(BRAIN.spikeCapUsd);
    expect(report.stopped).toBe('cap');
    expect(report.calls).toBe(5);
    expect(4 * billed + worst).toBeLessThanOrEqual(BRAIN.spikeCapUsd);
    expect(5 * billed + worst).toBeGreaterThan(BRAIN.spikeCapUsd);
    expect(report.countedUsd).toBeCloseTo(5 * billed, 12);
    expect(report.planned).toBe(40);
    expect(waits).toEqual(Array(5).fill(WAIT_MS.develop));
    const lines = ledgerLines();
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatchObject({ game: 'spike-2026-10-21', model: BRAIN.model, kind: 'develop', outcome: 'llm' });
  });

  it('INV-spike-cap: a call whose bill is unknown (timeout, lost connection) counts at its worst case; an error the API answered with a status counts $0', async () => {
    const worst = worstOf(150_000);
    const fits = Math.floor(BRAIN.spikeCapUsd / worst);
    expect(fits).toBeLessThan(50);
    const unknownBills = [
      failing(() => new Anthropic.APIConnectionTimeoutError()),
      failing(() => new Anthropic.APIConnectionError({ message: 'socket hang up' })),
      failing(() => new TypeError('fetch failed')),
      // A raw Error at the runSpike seam, not a CallFailed: nothing shows the API answered.
      async (): Promise<HaikuReply> => {
        throw new Error('raw');
      },
    ];
    for (const [i, complete] of unknownBills.entries()) {
      const at = path.join(dir, `unknown-${i}.jsonl`);
      const report = await run(items(50, 150_000), complete, BRAIN.spikeCapUsd, at);
      expect(report.calls).toBe(fits);
      expect(report.stopped).toBe('cap');
      expect(report.ledgerUsd).toBe(0);
      expect(report.countedUsd).toBeCloseTo(fits * worst, 12);
      expect(report.countedUsd + worst).toBeGreaterThan(BRAIN.spikeCapUsd);
      expect(ledgerLines(at)).toHaveLength(fits);
    }
    expect(ledgerLines(path.join(dir, 'unknown-0.jsonl'))[0]).toMatchObject({ outcome: 'timeout', timed_out: true });

    // Negative: a 500 the API answered was not billed, so all 50 run.
    const answered = await run(items(50, 150_000), failing(() => new Anthropic.InternalServerError(500, { type: 'error' }, 'overloaded', new Headers())));
    expect(answered.calls).toBe(50);
    expect(answered.countedUsd).toBe(0);
    expect(answered.stopped).toBe('done');
    expect(answered.kinds[0]).toMatchObject({ kind: 'develop', calls: 50, timeouts: 0, errors: 50 });
    expect(rowOf(renderReport(answered), 'develop')).toMatch(new RegExp(`^develop\\s+50\\s+0\\s+50\\s+—\\s+—\\s+—\\s+0% within ${WAIT_MS.develop} ms\\s+—$`));

    // Boundary: a cap of exactly three worst cases lets the third call start (<=) and stops the fourth.
    const exact = await run(items(10, 150_000), failing(() => timedOut()), worst + worst + worst, path.join(dir, 'exact.jsonl'));
    expect(exact.calls).toBe(3);
    expect(exact.stopped).toBe('cap');
  });

  it('INV-spike-report: a timed-out call is not "within", a percentile among timeouts prints as "> wait ms", and replies are classified as the service does', async () => {
    const answeredMs = [300, 600, 900, 1200, WAIT_MS.develop];
    const inputs = [100, 150, 200, 250, 300];
    // Answered: a usable reply, a refusal, an option off the shortlist, junk, a usable reply.
    const texts = [USABLE, USABLE, '{"option":"C","line":"x"}', 'not json', USABLE];
    let n = 0;
    const report = await run(items(10), async () => {
      const i = n++;
      if (i >= 5) throw timedOut();
      return reply(answeredMs[i]!, { input: inputs[i]! }, i === 1 ? 'refusal' : 'end_turn', texts[i]);
    });
    expect(report.calls).toBe(10);
    expect(report.stopped).toBe('done');
    const develop = report.kinds.find((r) => r.kind === 'develop')!;
    expect(develop.within).toBeLessThanOrEqual(0.5);

    const lines = renderReport(report);
    // A latency of exactly the wait counts as within: 5 of 10.
    // Usable replies: 2 of the 5 answered named an option on the list and were not refused.
    const wait = WAIT_MS.develop;
    expect(rowOf(lines, 'develop')).toMatch(new RegExp(`^develop\\s+10\\s+5\\s+0\\s+${wait} ms\\s+> ${wait} ms\\s+> ${wait} ms\\s+50% within ${wait} ms\\s+40% of 5$`));
    expect(rowOf(lines, 'all')).toMatch(/^all\s+10\s+5\s+0\s+—\s+—\s+—\s+50% within own wait\s+40% of 5$/);
    expect(lines).toContainEqual(expect.stringMatching(/^unreadable \/ off-list replies\s+1 \/ 1$/));
    expect(rowOf(lines, 'land')).toBeUndefined();
    expect(lines).toContainEqual(expect.stringMatching(/^first-call latency\s+300 ms$/));
    expect(lines).toContainEqual(expect.stringMatching(/^refusals \/ auth failures\s+1 \/ 0$/));
    expect(lines).toContainEqual(expect.stringMatching(/^cache read \/ write tokens\s+50 \/ 25$/));

    // Each answered call billed input + 10 cache read + 5 cache write tokens; timeouts billed none.
    const chars = SYSTEM + USER + SCHEMA_CHARS;
    const [min, median, max] = [chars / 315, chars / 215, chars / 115];
    expect(report.charsPerToken).toEqual({ min: expect.closeTo(min, 9), median: expect.closeTo(median, 9), max: expect.closeTo(max, 9) });
    expect(lines).toContainEqual(
      expect.stringMatching(new RegExp(`^chars per input token min / median / max\\s+${min.toFixed(2)} / ${median.toFixed(2)} / ${max.toFixed(2)}$`)),
    );
    expect(ledgerLines().map((l) => l.outcome)).toEqual(['llm', 'refused', 'off_list', 'unreadable', 'llm', 'timeout', 'timeout', 'timeout', 'timeout', 'timeout']);
  });

  it("INV-spike-report: a mixed-kind run waits each call at its own kind's wait, logs its kind, and reports a row per kind plus pooled", async () => {
    const kinds: SpikeItem['kind'][] = ['land', 'develop', 'trade', 'land', 'develop', 'trade', 'land', 'develop', 'trade', 'trade'];
    const list = kinds.map((k, i) => item(i, SYSTEM, k));
    const answerMs = { land: 4000, develop: 1000, trade: 2000 };
    const waits: number[] = [];
    let n = 0;
    const report = await run(list, async (_p, w) => {
      waits.push(w);
      if (n++ === 9) throw timedOut('trade');
      return reply(answerMs[kinds[n - 1]!]);
    });
    expect(waits).toEqual(kinds.map((k) => WAIT_MS[k]));
    expect(ledgerLines().map((l) => l.kind)).toEqual(kinds);
    expect(report.kinds.map((r) => r.kind)).toEqual(['land', 'develop', 'trade', 'all']);

    // A land answer at 4 s is inside land's wait but outside develop's and trade's: each row uses its own kind's wait.
    expect(answerMs.land).toBeLessThanOrEqual(WAIT_MS.land);
    expect(answerMs.land).toBeGreaterThan(Math.max(WAIT_MS.develop, WAIT_MS.trade));
    expect(answerMs.develop).toBeLessThanOrEqual(WAIT_MS.develop);
    expect(answerMs.trade).toBeLessThanOrEqual(WAIT_MS.trade);
    const lines = renderReport(report);
    expect(rowOf(lines, 'land')).toMatch(new RegExp(`^land\\s+3\\s+0\\s+0\\s+4000 ms\\s+4000 ms\\s+4000 ms\\s+100% within ${WAIT_MS.land} ms\\s+100% of 3$`));
    expect(rowOf(lines, 'develop')).toMatch(new RegExp(`^develop\\s+3\\s+0\\s+0\\s+1000 ms\\s+1000 ms\\s+1000 ms\\s+100% within ${WAIT_MS.develop} ms\\s+100% of 3$`));
    expect(rowOf(lines, 'trade')).toMatch(new RegExp(`^trade\\s+4\\s+1\\s+0\\s+2000 ms\\s+> ${WAIT_MS.trade} ms\\s+> ${WAIT_MS.trade} ms\\s+75% within ${WAIT_MS.trade} ms\\s+100% of 3$`));
    // Across mixed waits a pooled percentile mixes upper and lower bounds, so the pooled row prints none.
    expect(rowOf(lines, 'all')).toMatch(/^all\s+10\s+1\s+0\s+—\s+—\s+—\s+90% within own wait\s+100% of 9$/);
    expect(report.kinds.at(-1)).toMatchObject({ kind: 'all', p50: null, p90: null, max: null });
  });

  it('FM-auth: a 401 from the SDK stops brain:spike after one call with exit 2, and prints none of the SDK text', async () => {
    const SDK_TEXT = 'sdk-text-invalid-x-api-key';
    let calls = 0;
    sdk.create = () => {
      calls++;
      return Promise.reject(new Anthropic.AuthenticationError(401, { type: 'error', error: { message: SDK_TEXT } }, SDK_TEXT, new Headers()));
    };
    const out: string[] = [];
    const code = await main(['--calls', '5'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(calls).toBe(1);
    expect(sdk.built).toHaveLength(1);
    const text = out.join('\n');
    expect(text).not.toContain(SDK_TEXT);
    expect(text).not.toContain(KEY.ANTHROPIC_API_KEY);
    expect(text).toMatch(/^refusals \/ auth failures\s+0 \/ 1$/m);
    expect(out.at(-1)).toBe('Stopped: the API refused the credentials (401/403). Nothing more was called.');
  }, 30_000); // main plays a strategist game to collect prompts

  it('B-AC-3: with the key unset or blank, main names the variable in one line, builds no client and exits 1', async () => {
    const out: string[] = [];
    for (const env of [{}, { ANTHROPIC_API_KEY: '   ' }]) {
      const code = await main(['--calls', '3'], env, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) });
      expect(code).toBe(1);
    }
    expect(sdk.built).toEqual([]);
    expect(out).toEqual(['ANTHROPIC_API_KEY is not set; nothing called.', 'ANTHROPIC_API_KEY is not set; nothing called.']);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('INV-spike-cap: main prints the clamped cap and the planned count before the first call, and never prints the key', async () => {
    const out: string[] = [];
    let atFirstCall: string[] | null = null;
    let calls = 0;
    sdk.create = () => {
      calls++;
      atFirstCall ??= [...out];
      return usableReply();
    };
    const code = await main(['--calls', '4', '--max-usd', '1', '--seed', '101'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(calls).toBe(4);
    expect(sdk.built).toEqual([expect.objectContaining({ apiKey: KEY.ANTHROPIC_API_KEY })]);
    expect(atFirstCall).toHaveLength(1);
    expect(atFirstCall![0]).toMatch(/cap \$0\.05, planned 4 calls/);
    expect(out.join('\n')).not.toContain(KEY.ANTHROPIC_API_KEY);
    expect(out).toContainEqual(expect.stringMatching(/^develop\s/));
    expect(ledgerLines()).toHaveLength(4);
  }, 30_000); // main plays a strategist game to collect prompts

  it('INV-spike-cap: main --max-usd 0.01 prints cap $0.01 and keeps the counted spend within it', async () => {
    // Each call bills about its own worst case: the prompt at BRAIN.charsPerToken as a cache write, and a full reply.
    let calls = 0;
    sdk.create = (params) => {
      calls++;
      const { system, user } = promptOf(params);
      const chars = system.length + user.length;
      return Promise.resolve(sdkMessage(USABLE, { cache_write: Math.ceil(chars / BRAIN.charsPerToken), output: BRAIN.maxTokens }));
    };
    const out: string[] = [];
    const code = await main(['--calls', '50', '--max-usd', '0.01'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(out[0]).toMatch(/cap \$0\.01, planned 50 calls/);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(50);
    expect(out).toContainEqual(expect.stringMatching(/^stopped because\s+cap$/));
    const counted = Number(/^counted spend \(cap \$0\.01\)\s+\$([\d.]+)$/m.exec(out.join('\n'))?.[1]);
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeLessThanOrEqual(0.01);
    expect(ledgerLines()).toHaveLength(calls);
    expect(ledgerLines().reduce((sum, l) => sum + (l.usd as number), 0)).toBeLessThanOrEqual(0.01);
  }, 30_000); // main plays a strategist game to collect prompts

  it("INV-spike-cap: main refuses a second run on the same day: today's ledger exists, one line names it, nothing is called; a run that calls nothing leaves the clearance unused", async () => {
    fs.writeFileSync(path.join(dir, 'spike-2026-10-20.jsonl'), '');
    let calls = 0;
    sdk.create = () => (calls++, usableReply());

    // A cap below the first call's worst case calls nothing, writes no ledger and leaves today's clearance unused.
    const none: string[] = [];
    expect(await main(['--calls', '2', '--max-usd', '0.0001'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => none.push(l) })).toBe(0);
    expect(calls).toBe(0);
    expect(none).toContainEqual(expect.stringMatching(/^calls made \/ planned\s+0 \/ 2$/));
    expect(fs.existsSync(file)).toBe(false);

    // The ledger is created exclusively as the first call starts: one that appears after the check stops the run uncalled.
    const appears = (l: string) => {
      if (l.startsWith('brain:spike model')) fs.writeFileSync(file, '');
    };
    await expect(main(['--calls', '2'], KEY, { dataDir: dir, now: () => TODAY, out: appears })).rejects.toThrow('EEXIST');
    expect(calls).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe('');
    fs.rmSync(file);

    const first: string[] = [];
    expect(await main(['--calls', '2'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => first.push(l) })).toBe(0);
    expect(calls).toBe(2);
    expect(fs.existsSync(file)).toBe(true);

    const second: string[] = [];
    expect(await main(['--calls', '2'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => second.push(l) })).toBe(1);
    expect(second).toHaveLength(1);
    expect(second[0]).toContain(file);
    expect(calls).toBe(2);
    expect(sdk.built).toHaveLength(3);
  }, 30_000); // four runs, each playing a strategist game to collect prompts

  it("INV-spike-cap: main accepts pnpm's leading --, and refuses an unknown, malformed or stray argument with usage and no call", async () => {
    let calls = 0;
    sdk.create = () => (calls++, usableReply());
    const refused = [
      ['--calls=3'],
      ['--max-usd=0.01'],
      ['--calls'],
      ['--calls', 'x'],
      ['--calls', '3', '--max-usd'],
      ['--max-usd', ''],
      ['--max-usd', '0'],
      ['--calls', '2', '--calls', '3'],
      ['--bogus', '1'],
      ['stray'],
      ['--calls', '3', 'stray'],
      ['--calls', '3', '--'],
      ['--calls', '0'],
      ['--calls', '1.5'],
      ['--seed', '1.5'],
      ['--max-usd', 'Infinity'],
    ];
    for (const argv of refused) {
      const out: string[] = [];
      expect(await main(argv, KEY, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) }), argv.join(' ')).toBe(1);
      expect(out, argv.join(' ')).toEqual([expect.stringMatching(/^Usage: brain:spike .*; nothing called\.$/)]);
    }
    expect(sdk.built).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);

    const out: string[] = [];
    expect(await main(['--', '--calls', '2', '--max-usd', '0.01', '--seed', '101'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) })).toBe(0);
    expect(out[0]).toMatch(/cap \$0\.01, planned 2 calls/);
    expect(calls).toBe(2);
  }, 30_000); // main plays a strategist game to collect prompts

  it('INV-spike-report: decisions mix kinds round-robin and build real prompts from one strategist game, only ones the model would be asked, each attributed as the game recorded it', () => {
    // The oracle: the same game played here, with each decision's seat view taken when the phase it was made in ends.
    const asked: { record: DecisionRecord; view: GameState | null }[] = [];
    const played = playGame(101, simSeats(4, 'trader', 101), {
      onDecision: (record) => asked.push({ record, view: null }),
      onPhase: (state) => {
        for (const a of asked) a.view ??= observe(state, a.record.seat);
      },
    });
    const seatOf = (id: string) => played.seats.find((s) => s.id === id)!;
    const playerOf = (id: string) => played.state.players.find((p) => p.id === id)!;
    const summariesFor = (it: SpikeItem): string[] =>
      asked
        .filter((a) => a.record.seat === it.seat && a.record.kind === it.kind && a.record.month === it.context.month)
        .filter((a) => JSON.stringify(a.record.shortlist) === JSON.stringify(it.shortlist))
        .map((a) => situation(a.view ?? observe(played.state, a.record.seat), seatOf(a.record.seat).mind));

    const list = collectPrompts(101, 50);
    expect(list).toHaveLength(50);
    // Round-robin: the first three are three different kinds.
    expect(new Set(list.slice(0, 3).map((i) => i.kind)).size).toBe(3);
    expect(new Set(list.map((i) => i.seat)).size).toBeGreaterThan(1);
    for (const it of list) {
      // Brain.ask never asks the model with fewer than two options.
      expect(it.shortlist.length).toBeGreaterThanOrEqual(2);
      const seat = seatOf(it.seat);
      expect({ persona: it.persona, level: it.level }).toEqual({ persona: seat.mind.personaId, level: seat.mind.levelId });
      expect(it.prompt.system.endsWith(PERSONAS[seat.mind.personaId as SpikeItem['persona']].card)).toBe(true);
      expect(it.prompt.user).toContain(`Decision: ${it.kind}\nYou are ${playerOf(it.seat).name}. Month ${it.context.month} of 12.`);
      const summaries = summariesFor(it);
      expect(summaries.length).toBeGreaterThan(0);
      expect(summaries.some((s) => it.prompt.user.includes(`\n\n${s}\n\n`))).toBe(true);
      for (const option of it.shortlist) expect(it.prompt.user).toContain(`${option.id}. ${option.label} — `);
    }
  }, 30_000); // two strategist games
});
