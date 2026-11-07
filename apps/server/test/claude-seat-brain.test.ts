import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WriterBrief } from '@mule/ai';
import type { Spoken } from '../src/brain/chat.js';
import { createBrain, type BrainSeat } from '../src/brain/index.js';
import type { SeatKind } from '../src/claude-seat/seats.js';
import { ClaudeSeatWriter } from '../src/claude-seat/writer.js';
import { DEFAULT_AI_LEVEL } from '../src/mule-game.js';
import { readLedger, type SdkModuleFake } from './brain-fakes.js';

/** The SDK module's constructor and its create, each counted, so a seat that calls the model fails. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));
let modelCalls = 0;

const KEYED = { ANTHROPIC_API_KEY: 'test-key-not-real' };
const OFFER = '/auction/food/limit';

const seat = (id: string, kind?: SeatKind): BrainSeat => ({ id, persona: 'trader', level: DEFAULT_AI_LEVEL, ...(kind ? { kind } : {}) });

const brief = (): WriterBrief => ({
  text: 'The auction opens on food.',
  plans: [],
  corners: false,
  strategy: { kind: 'builder', moneyMaker: null, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 4, byMonth: 12 }, stances: {}, reason: 'draft' },
  offers: [{ path: OFFER, to: { type: 'number' } }],
  strategyOffered: false,
});

const ledgerLines = (game: string) => {
  const file = process.env.MULE_BRAIN_LOG!;
  return fs.existsSync(file) ? readLedger(file).filter((line) => line.game === game) : [];
};

beforeEach(() => {
  sdkModule.built = [];
  modelCalls = 0;
  sdkModule.create = () => {
    modelCalls += 1;
    return Promise.reject(new Error('no model call in these tests'));
  };
});

describe('a Claude seat in the brain', () => {
  it('T-AC-3: keyless writerFor(claude seat) is a ClaudeSeatWriter; deciderFor null', () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    const brain = createBrain({ gameId: 'g-tac3' });

    const writer = brain.writerFor(seat('s2', 'claude'));

    expect(writer).toBeInstanceOf(ClaudeSeatWriter);
    expect(brain.writerFor(seat('s2', 'claude'))).toBe(writer);
    expect(brain.deciderFor(seat('s2', 'claude'))).toBeNull();
    expect(brain.writerFor(seat('s3', 'builtin'))).toBeNull();
    expect(brain.writerFor(seat('s4'))).toBeNull();
    expect(brain.deciderFor(seat('s3', 'builtin'))).toBeNull();
    expect(sdkModule.built).toEqual([]);
  });

  it('T-AC-3: a keyed brain gives a claude seat the same writer and no decider; its builtin seats stay Smart', () => {
    const brain = createBrain({ gameId: 'g-tac3-keyed', env: KEYED });

    expect(brain.writerFor(seat('s2', 'claude'))).toBeInstanceOf(ClaudeSeatWriter);
    expect(brain.deciderFor(seat('s2', 'claude'))).toBeNull();
    expect(brain.writerFor(seat('s3'))).not.toBeInstanceOf(ClaudeSeatWriter);
    expect(brain.deciderFor(seat('s3'))).not.toBeNull();
    brain.finish();
  });

  it("T-AC-3: a keyed brain's Claude seat writes a plan with no model call and no ledger line", async () => {
    const gameId = 'g-tac3-keyed-write';
    const brain = createBrain({ gameId, env: KEYED });
    const writer = brain.writerFor(seat('s2', 'claude')) as ClaudeSeatWriter;

    const written = writer.write('playbook', { brief: brief(), system: 'rules', waitMs: 30_000, signal: new AbortController().signal });
    const result = await writer.submit(writer.openAsk()!.id, { edits: [{ path: OFFER, to: 40, reason: 'cheap' }], line: 'Food for all.' });
    brain.finish();

    expect(result.kind).toBe('accepted');
    expect((await written).reply.edits).toEqual([{ path: OFFER, to: 40, reason: 'cheap' }]);
    expect(sdkModule.built).toHaveLength(1);
    expect(modelCalls).toBe(0);
    expect(ledgerLines(gameId)).toEqual([]);
  });

  it('T-AC-3: a Claude seat speaks with the same voice on a keyed host as on a keyless one', () => {
    const records: Spoken[] = [
      { month: 1, phase: 'landGrant', by: 'top', line: 'I take the river plot.' },
      { month: 1, phase: 'auction', by: 'llm', line: 'Ore for sale.' },
    ];
    const heard = (env: Record<string, string>) => {
      const said: string[] = [];
      const brain = createBrain({ gameId: 'g-voice', env });
      const speak = brain.chatter(seat('s2', 'claude'), (line) => said.push(line));
      for (const record of records) speak(record);
      brain.finish();
      return said;
    };

    const keyless = heard({});

    expect(keyless).toEqual(['I take the river plot.', 'Ore for sale.']);
    expect(heard(KEYED)).toEqual(keyless);
  });
});
