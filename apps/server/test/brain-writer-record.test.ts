/** A writer call through the game recorder and the replay: what the record holds of it, and what the replay answers. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, type GameRecord, type GameState, type Strategy } from '@mule/engine';
import type { LandBrief, WriterReply } from '@mule/ai';
import type { MuleIntent } from '@mule/protocol';
import type { GameContext, SeatInfo } from '@tabletop/core';
import { WRITE_CALLS } from '../src/brain/client.js';
import { createBrain, type BrainService, type WriteAsk } from '../src/brain/index.js';
import { createRecordedGame } from '../src/record.js';
import { replay } from '../src/replay.js';
import { fakeSdk, KEY, promptOf, readLedger, sdkMessage } from './brain-fakes.js';

const SEATS: SeatInfo[] = [
  { id: 'p0', name: 'Ada', isAi: true, color: 0 },
  { id: 'p1', name: 'Heiko', isAi: false, color: 1 },
];
const STATE: GameState = createGame({ seed: 3, players: SEATS.map(({ id, name, isAi }) => ({ id, name, isAi })) });

const STRATEGY: Strategy = { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 200, landTarget: { plots: 6, byMonth: 6 }, stances: {}, reason: 'Grow steady.' };
const RANKED = [{ plot: 12, value: 410 }];
const BRIEF: LandBrief = { text: 'You are Ada. The land brief.', plans: [{ id: 'A', label: 'Take the river', ranked: RANKED }], corners: true, strategy: STRATEGY };
const ASK: WriteAsk = { brief: BRIEF, system: 'The manual.', waitMs: 5_000 };
/** An edit path the brief never offers: the writer refuses it, and nothing of it may reach the record. */
const REFUSED_PATH = '/landGrant/MARK-refused-7w';
const REPLY_TEXT = JSON.stringify({
  strategy: { kind: 'specialist', moneyMaker: 'smithore', monopolyTarget: null, cashFloor: 150, reason: 'Ore pays.' },
  edits: [
    { path: '/landGrant/ranked', to: 'A', reason: 'River.' },
    { path: REFUSED_PATH, to: 1, reason: 'Sneak.' },
  ],
  line: 'Ore.',
});

/**
 * Stands in for the game until playbooks.ts asks the writer: at start it asks seat p0's writer once, keeps what came
 * back, and ends the game. Its brain is the recorder's while recording and the replay's while replaying.
 */
const asked = vi.hoisted(() => ({ written: [] as unknown[] }));
vi.mock('../src/mule-game.js', async (original) => {
  const real = await original<typeof import('../src/mule-game.js')>();
  class WriterGame {
    constructor(
      _ctx: GameContext,
      _seed: number,
      private readonly options: { brain: BrainService; onGameOver?: (state: GameState) => void },
    ) {}
    start(seats: SeatInfo[]): void {
      const writer = this.options.brain.writerFor({ id: seats[0]!.id, persona: 'trader', level: 'trader' });
      void writer?.write('strategy', ASK).then((r) => {
        asked.written.push(structuredClone(r));
        // A caller that goes on to change the reply it was handed must not change what was recorded.
        r.reply.line = 'MUTATED';
        r.reply.edits[0]!.to = 'MUTATED';
        r.reply.edits.push({ path: '/landGrant/claims', to: 9, reason: 'MUTATED' });
        this.options.onGameOver?.(STATE);
      });
    }
    handle(): void {}
    connectionChanged(): void {}
    seatMoved(): void {}
    viewFor(): never {
      throw new Error('no views in this test');
    }
    dispose(): void {}
  }
  return { ...real, MuleGame: WriterGame };
});

const sdkBuilt = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/brain/client.js', async (original) => ({
  ...(await original<typeof import('../src/brain/client.js')>()),
  createAnthropicSdk: () => {
    sdkBuilt.count++;
    throw new Error('this test must never build the SDK');
  },
}));

const ctx: GameContext = { now: () => 1_000, hostId: () => null, schedule: () => () => {}, changed: () => {}, frame: () => {} };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

let dir: string;
beforeEach(() => {
  asked.written = [];
  sdkBuilt.count = 0;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-writer-record-'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Records the stand-in game with a keyed brain on a fake SDK that answers REPLY_TEXT. */
async function recorded() {
  const sdk = fakeSdk(() => sdkMessage(REPLY_TEXT, { input: 400, output: 60 }));
  const logPath = path.join(dir, 'costs.jsonl');
  const brain = createBrain({ gameId: 'g-writer', env: KEY, logPath, sdkFactory: () => sdk });
  const { game, recorder } = createRecordedGame({ ctx, seed: 3, options: { maxMonths: 1, politics: false }, brain });
  game.start(SEATS);
  for (let i = 0; i < 5 && !recorder.finished; i++) await settle();
  expect(recorder.finished, 'the record is complete at game over').not.toBeNull();
  const record = JSON.parse(JSON.stringify(recorder.finished)) as GameRecord<MuleIntent>;
  return { record, sdk, logPath, written: asked.written[0] as WriterReply };
}

describe('the writer port through the game record', () => {
  it('INV-writer-recorded: one write call leaves one pending call and one answer whose write is the reply; the replay returns it as recorded and builds no client', async () => {
    const { record, sdk, logPath, written } = await recorded();

    // The writer's reply, derived by hand from REPLY_TEXT, the brief and the draft's strategy.
    const reply = {
      strategy: { ...STRATEGY, kind: 'specialist', moneyMaker: 'smithore', monopolyTarget: null, cashFloor: 150, reason: 'Ore pays.' },
      edits: [
        { path: '/strategy/kind', to: 'specialist', reason: 'Ore pays.' },
        { path: '/strategy/moneyMaker', to: 'smithore', reason: 'Ore pays.' },
        { path: '/strategy/monopolyTarget', to: null, reason: 'Ore pays.' },
        { path: '/strategy/cashFloor', to: 150, reason: 'Ore pays.' },
        { path: '/strategy/reason', to: 'Ore pays.', reason: 'Ore pays.' },
        { path: '/landGrant/ranked', to: RANKED, reason: 'River.' },
      ],
      line: 'Ore.',
    };
    expect(written.reply).toEqual(reply);

    // One model call, the kind's model, the brief as the user text, the given wait; one ledger line of the kind.
    expect(sdk.calls).toBe(1);
    expect(sdk.requests[0]!.params.model).toBe(WRITE_CALLS.strategy.model);
    expect(promptOf(sdk.requests[0]!.params)).toEqual({ system: ASK.system, user: BRIEF.text });
    expect(sdk.requests[0]!.options.timeout).toBe(ASK.waitMs);
    const calls = readLedger(logPath).filter((l) => l.type === undefined);
    expect(calls.map((l) => [l.kind, l.outcome])).toEqual([['strategy', 'llm']]);
    expect(calls[0]).toMatchObject({ input: 400, output: 60 });
    expect(calls[0]!.usd).toBeGreaterThan(0);

    // The record: the seat is Smart, the start step notes the call pending, and one answer step holds the reply.
    expect(record.seats.map((s) => [s.id, s.smart])).toEqual([['p0', true], ['p1', false]]);
    const start = record.events.find((e) => e.type === 'start')!;
    expect(start.type === 'start' && start.decides).toEqual([{ seat: 'p0', call: 1, kind: 'strategy', pending: true }]);
    const answers = record.events.filter((e) => e.type === 'answer');
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ type: 'answer', seat: 'p0', call: 1, kind: 'strategy' });
    expect(answers[0]!.type === 'answer' && answers[0]!.write).toEqual(reply);
    expect(JSON.stringify(record)).not.toContain('MUTATED');

    // The replay, with the key set: the game is handed the recorded reply, no SDK is built and no call is made.
    vi.stubEnv('ANTHROPIC_API_KEY', KEY.ANTHROPIC_API_KEY);
    asked.written = [];
    const result = await replay(record);
    expect(result.identical).toBe(true);
    expect(asked.written).toEqual([{ reply, refused: [] }]);
    expect(sdkBuilt.count).toBe(0);
    expect(sdk.calls).toBe(1);
  });

  it('INV-refused-not-recorded: an edit the writer refused comes back beside the reply, never in it, and nothing of it reaches the record', async () => {
    const { record, written } = await recorded();

    expect(written.refused).toEqual([{ path: null, cause: 'path_not_offered' }]);
    expect(written.reply).not.toHaveProperty('refused');
    expect(written.reply.edits.map((e) => e.path)).not.toContain(REFUSED_PATH);
    const text = JSON.stringify(record);
    expect(text).not.toContain(REFUSED_PATH);
    expect(text).not.toContain('Sneak.');
    expect(text).not.toContain('path_not_offered');
    expect(text).not.toContain('"refused"');
  });
});
