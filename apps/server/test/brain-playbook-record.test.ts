/** A game whose Smart seat had a written playbook, recorded and replayed: the replay writes the recorded playbook. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameRecord, PlaybookEntry } from '@mule/engine';
import type { MuleIntent } from '@mule/protocol';
import { createBrain } from '../src/brain/index.js';
import { createRecordedGame } from '../src/record.js';
import { replay, ReplayDiverged } from '../src/replay.js';
import { fakeSdk, KEY, promptOf, sdkMessage, type SdkParams } from './brain-fakes.js';
import { fakeContext, seats as THREE } from './fake-context.js';
import { runTable } from './playbook-fakes.js';

// The engine's source, as it will be once the engine drafts and validates playbooks: live and replayed games both build on it.
vi.mock('../src/brain/playbooks.js', async (original) => ({
  ...(await original<typeof import('../src/brain/playbooks.js')>()),
  ENGINE_SOURCE: (await import('./playbook-fakes.js')).stubSource(),
}));

const SEED = 10;
const isWrite = (params: SdkParams) => promptOf(params).user.includes('What you may change:');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a written playbook through the record and the replay', { timeout: 30_000 }, () => {
  it("B-AC-A1 (record), T-AC-11: a recorded game with a playbook by 'llm' replays with the key unset, writing a playbook equal to the recorded entry; a changed entry diverges", async () => {
    const sdk = fakeSdk((_n, params) =>
      sdkMessage(isWrite(params) ? JSON.stringify({ edits: [{ path: '/landGrant/ranked', to: 'B', reason: 'B is mine.' }], line: '' }) : JSON.stringify({ option: 'A', line: '' })),
    );
    const fake = fakeContext({ table: THREE });
    const brain = createBrain({ gameId: 'g-playbook-record', env: KEY, sdkFactory: () => sdk });
    const { game, recorder } = createRecordedGame({ ctx: fake.ctx, seed: SEED, options: { maxMonths: 1, politics: false }, brain });
    game.start(THREE);
    const starts = await runTable(game, fake, () => false);
    expect(starts.at(-1)?.[1]).toBe('gameOver');
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    expect(recorder.finished, 'the record is complete at game over').not.toBeNull();
    const record = JSON.parse(JSON.stringify(recorder.finished)) as GameRecord<MuleIntent>;

    const playbooks = record.events.filter((e): e is PlaybookEntry => e.type === 'playbook');
    expect(playbooks.map((e) => [e.seat, e.month, e.phase, e.playbook.by])).toEqual([['s3', 1, 'landGrant', 'llm']]);
    const calls = sdk.calls;

    const result = await replay(record);
    expect(result.identical).toBe(true);
    expect(sdk.calls, 'the replay calls no model').toBe(calls);

    // Positive control: the replay checks the playbook it writes against the recorded entry.
    const changed = structuredClone(record);
    const entry = changed.events.find((e): e is PlaybookEntry => e.type === 'playbook')!;
    entry.playbook.landGrant!.ranked.reverse();
    await expect(replay(changed)).rejects.toThrow(ReplayDiverged);
    await expect(replay(changed)).rejects.toThrow(/playbook differs/);
  });
});
