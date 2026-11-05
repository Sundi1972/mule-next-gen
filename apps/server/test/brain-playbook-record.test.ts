/**
 * A game whose Smart seat had a written playbook, recorded and replayed: the replay writes the recorded playbook. The
 * game's own source drafts and validates it (WS9's playbookSource), live and in the replay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameRecord, PlaybookEntry } from '@mule/engine';
import type { MuleIntent } from '@mule/protocol';
import { createBrain } from '../src/brain/index.js';
import { createRecordedGame } from '../src/record.js';
import { replay, ReplayDiverged } from '../src/replay.js';
import { fakeSdk, KEY, promptOf, sdkMessage, type SdkMessage, type SdkParams } from './brain-fakes.js';
import { fakeContext, seats as THREE } from './fake-context.js';
import { runTable } from './playbook-fakes.js';

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

  it("B-AC-A2 (auction): a recorded game with a Claude-edited auction playbook replays with the key unset to the same game, calling no model; a changed entry diverges", async () => {
    let edited: string | null = null;
    const sdk = fakeSdk((_n, params) => {
      const { user } = promptOf(params);
      if (user.includes('Your draft auction:')) {
        // The first good the brief offers: its hold, one unit lower.
        const offered = (params.output_config?.format?.schema as { properties: { edits: { items: { anyOf: { properties: { path: { enum: string[] } } }[] } } } }).properties.edits.items.anyOf.map((v) => v.properties.path.enum[0]!);
        edited = offered.find((p) => p.endsWith('/hold'))!;
        return sdkMessage(JSON.stringify({ edits: [{ path: edited, to: 0, reason: 'Keep none.' }], line: '' }));
      }
      if (isWrite(params)) return sdkMessage(JSON.stringify({ edits: [], line: '' }));
      return sdkMessage(JSON.stringify({ option: 'A', line: '' }));
    });
    const fake = fakeContext({ table: THREE });
    const brain = createBrain({ gameId: 'g-playbook-auction', env: KEY, sdkFactory: () => sdk });
    const { game, recorder } = createRecordedGame({ ctx: fake.ctx, seed: SEED, options: { maxMonths: 1, politics: false }, brain });
    game.start(THREE);
    expect((await runTable(game, fake, () => false)).at(-1)?.[1]).toBe('gameOver');
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    const record = JSON.parse(JSON.stringify(recorder.finished)) as GameRecord<MuleIntent>;

    const auction = record.events.filter((e): e is PlaybookEntry => e.type === 'playbook' && e.phase === 'auction');
    expect(edited, 'the auction brief offered a hold').not.toBeNull();
    expect(auction.map((e) => [e.seat, e.month, e.playbook.by])).toEqual([['s3', 1, 'llm']]);
    expect(auction[0]!.playbook.edits?.map((e) => e.path)).toEqual([edited]);
    const calls = sdk.calls;

    const result = await replay(record);
    expect(result.identical).toBe(true);
    expect(sdk.calls, 'the replay calls no model').toBe(calls);

    // Positive control: the replay checks the auction playbook it adopts against the recorded entry.
    const changed = structuredClone(record);
    const entry = changed.events.find((e): e is PlaybookEntry => e.type === 'playbook' && e.phase === 'auction')!;
    entry.playbook.edits = [];
    await expect(replay(changed)).rejects.toThrow(/playbook differs/);
  });

  it("B-AC-A2 (development, option C): a recorded game whose land write carried a Claude-edited development part replays with the key unset to the same game, calling no model; a changed entry diverges", async () => {
    const DEV_BUDGET_MS = 9_000;
    const sdk = fakeSdk((_n, params) => {
      const { user } = promptOf(params);
      if (user.includes('Your draft land grant:')) return sdkMessage(JSON.stringify({ edits: [{ path: '/development/timeBudgetMs', to: DEV_BUDGET_MS, reason: 'Quick month.' }], line: '' }));
      if (isWrite(params)) return sdkMessage(JSON.stringify({ edits: [], line: '' }));
      return sdkMessage(JSON.stringify({ option: 'A', line: '' }));
    });
    const fake = fakeContext({ table: THREE });
    const brain = createBrain({ gameId: 'g-playbook-dev', env: KEY, sdkFactory: () => sdk });
    const { game, recorder } = createRecordedGame({ ctx: fake.ctx, seed: SEED, options: { maxMonths: 1, politics: false }, brain });
    game.start(THREE);
    expect((await runTable(game, fake, () => false)).at(-1)?.[1]).toBe('gameOver');
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    const record = JSON.parse(JSON.stringify(recorder.finished)) as GameRecord<MuleIntent>;

    const dev = record.events.filter((e): e is PlaybookEntry => e.type === 'playbook' && e.phase === 'development');
    expect(dev.map((e) => [e.seat, e.month, e.playbook.by, e.playbook.development?.timeBudgetMs])).toEqual([['s3', 1, 'llm', DEV_BUDGET_MS]]);
    const calls = sdk.calls;

    const result = await replay(record);
    expect(result.identical).toBe(true);
    expect(sdk.calls, 'the replay calls no model').toBe(calls);

    // Positive control: the replay checks the development playbook it adopts against the recorded entry.
    const changed = structuredClone(record);
    changed.events.find((e): e is PlaybookEntry => e.type === 'playbook' && e.phase === 'development')!.playbook.development!.timeBudgetMs += 1_000;
    await expect(replay(changed)).rejects.toThrow(/playbook differs/);
  });

  /** When the write's reply is let go: before the land grant, after it started, or in its tick just before it starts. */
  type Release = 'beforeGrant' | 'afterGrant' | 'inGrantTick';
  const ROWS: { release: Release; by: 'llm' | 'engine'; recorded: 'reply' | 'no_reply'; answered: 'before' | 'after' }[] = [
    { release: 'beforeGrant', by: 'llm', recorded: 'reply', answered: 'before' },
    // The land grant cancels the call, so what is recorded is no reply.
    { release: 'afterGrant', by: 'engine', recorded: 'no_reply', answered: 'after' },
    // The reply came first, but the land grant started before the game took it.
    { release: 'inGrantTick', by: 'engine', recorded: 'reply', answered: 'after' },
  ];
  it.each(ROWS)(
    "T-AC-11: a recorded game whose Smart seat's write reply is let go $release replays identically with the key unset, and its land-grant playbook is by $by",
    async ({ release: when, by, recorded, answered }) => {
      let release = () => {};
      // Like the real SDK, a call aborted before it answered rejects at once.
      const sdk = fakeSdk((_n, params, options) =>
        isWrite(params)
          ? new Promise<SdkMessage>((resolve, reject) => {
              release = () => resolve(sdkMessage(JSON.stringify({ edits: [{ path: '/landGrant/ranked', to: 'B', reason: 'B is mine.' }], line: '' })));
              options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
            })
          : sdkMessage(JSON.stringify({ option: 'A', line: '' })),
      );
      const fake = fakeContext({ table: THREE });
      const brain = createBrain({ gameId: `g-playbook-${when}`, env: KEY, sdkFactory: () => sdk });
      const { game, recorder } = createRecordedGame({ ctx: fake.ctx, seed: SEED, options: { maxMonths: 1, politics: false }, brain });
      game.start(THREE);
      await vi.advanceTimersByTimeAsync(0);
      expect(game.viewFor(null).phase).toBe('planning');
      if (when === 'beforeGrant') release();
      if (when === 'inGrantTick') {
        release();
        // The people press Ready in planning: the last one starts the land grant, in this same tick.
        for (const s of THREE) if (!s.isAi) game.handle(s.id, { type: 'ready' });
      }
      await runTable(game, fake, (view) => view.phase === 'landGrant');
      if (when === 'afterGrant') release();
      expect((await runTable(game, fake, () => false)).at(-1)?.[1]).toBe('gameOver');
      await vi.advanceTimersByTimeAsync(0);
      vi.useRealTimers();
      expect(recorder.finished, 'the record is complete at game over').not.toBeNull();
      const record = JSON.parse(JSON.stringify(recorder.finished)) as GameRecord<MuleIntent>;

      const playbooks = record.events.filter((e): e is PlaybookEntry => e.type === 'playbook');
      expect(playbooks.map((e) => [e.seat, e.month, e.playbook.by])).toEqual([['s3', 1, by]]);
      const answers = record.events.filter((e) => e.type === 'answer' && e.kind === 'strategy');
      expect(answers).toHaveLength(1);
      const answer = answers[0]!;
      expect(answer.type === 'answer' && (answer.write?.cause ?? 'reply')).toBe(recorded);
      expect(answer.seq < playbooks[0]!.seq ? 'before' : 'after', "the answer's step against the land grant's").toBe(answered);
      const calls = sdk.calls;

      const result = await replay(record);
      expect(result.identical).toBe(true);
      expect(sdk.calls, 'the replay calls no model').toBe(calls);
    },
  );
});
