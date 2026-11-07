import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MuleIntent, MuleView } from '@mule/protocol';
import type { Game, SeatInfo } from '@tabletop/core';
import { createBrain, type BrainSeat } from '../src/brain/index.js';
import { claudeSeatAt, type SeatKind } from '../src/claude-seat/seats.js';
import { ClaudeSeatWriter } from '../src/claude-seat/writer.js';
import { DEFAULT_AI_LEVEL, MuleGame, type PlaybookNote } from '../src/mule-game.js';
import type { SdkModuleFake } from './brain-fakes.js';
import { fakeContext } from './fake-context.js';
import { runTable } from './playbook-fakes.js';

/** The SDK module's constructor: records every client built, so a seat that builds one fails. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));

const seat = (id: string, kind?: SeatKind): BrainSeat => ({ id, persona: 'trader', level: DEFAULT_AI_LEVEL, ...(kind ? { kind } : {}) });

/** A table as the Room will hand it to the game once seats carry their kind (C1): the host, a Claude seat, a built-in one. */
const TABLE: (SeatInfo & { kind?: SeatKind })[] = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Claudia', isAi: true, color: 1, kind: 'claude' },
  { id: 's3', name: 'The Accountant', isAi: true, color: 2, kind: 'builtin' },
];

beforeEach(() => {
  sdkModule.built = [];
  sdkModule.create = null;
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
    const brain = createBrain({ gameId: 'g-tac3-keyed', env: { ANTHROPIC_API_KEY: 'test-key-not-real' } });

    expect(brain.writerFor(seat('s2', 'claude'))).toBeInstanceOf(ClaudeSeatWriter);
    expect(brain.deciderFor(seat('s2', 'claude'))).toBeNull();
    expect(brain.writerFor(seat('s3'))).not.toBeInstanceOf(ClaudeSeatWriter);
    expect(brain.deciderFor(seat('s3'))).not.toBeNull();
    brain.finish();
    expect(sdkModule.create).toBeNull();
  });

  it('B-AC-9: a keyless game with a Claude seat writes plans and no paid ledger line', async () => {
    const ledger = process.env.MULE_BRAIN_LOG!;
    const ledgerBefore = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : '';
    const fake = fakeContext({ table: TABLE });
    const notes: PlaybookNote[] = [];
    const game = new MuleGame(fake.ctx, 10, { maxMonths: 1, recordPlaybook: (note) => notes.push(note) });
    game.start(TABLE);

    const claude = claudeSeatAt(game, 's2');
    expect(claude?.name).toBe('Claudia');
    const ask = claude!.writer.openAsk();
    expect(ask?.phase).toBe('land');
    expect(claudeSeatAt(game, 's3')).toBeNull();
    const result = await claude!.writer.submit(ask!.id, { edits: [{ path: '/landGrant/ranked', to: 'A', reason: 'The best plan.' }], line: 'Mine, all mine.' });
    expect(result.kind).toBe('accepted');

    await runTable(game as Game<MuleIntent, MuleView>, fake, () => false);

    expect(game.viewFor(null).phase).toBe('gameOver');
    expect(notes.filter((n) => n.seat === 's2' && n.playbook.by === 'llm').map((n) => n.phase)).toEqual(['landGrant']);
    expect((game as unknown as { away: Set<string> }).away.has('s2')).toBe(false);
    expect(claude!.writer.over).toBe(true);
    const ledgerAfter = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8') : '';
    expect(ledgerAfter).toBe(ledgerBefore);
    expect(sdkModule.built).toEqual([]);
  });
});
