import { DEV_STEER, type GameRecord } from '@mule/engine';
import type { DevFrame, MuleIntent } from '@mule/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrain } from '../src/brain/index.js';
import { createRecordedGame } from '../src/record.js';
import { replay } from '../src/replay.js';
import { fakeContext, pressAct, readyAll, steerTo, walkers, type SteerPoint } from './fake-context.js';
import { HALL, boxOf } from '@mule/engine';

const LENA = 's1';
const OSSA = 's2';
const TICK = DEV_STEER.tickMs;

let flag = DEV_STEER.on;
beforeEach(() => {
  flag = DEV_STEER.on;
  DEV_STEER.on = true;
});
afterEach(() => {
  DEV_STEER.on = flag;
});

const pub: SteerPoint[] = [
  { space: 'hall', ...HALL.spots.pub },
  { space: 'hall', x: (boxOf('pub').x0 + boxOf('pub').x1) / 2, y: (boxOf('pub').y0 + boxOf('pub').y1) / 2 },
];
const corral: SteerPoint[] = [
  { space: 'hall', ...HALL.spots.corral },
  { space: 'hall', x: (boxOf('corral').x0 + boxOf('corral').x1) / 2, y: (boxOf('corral').y0 + boxOf('corral').y1) / 2 },
];

/**
 * A one-month game of Lena and Ossa, recorded through the fake clock with the flag on. In development Lena steers into
 * the store, buys a MULE and ends her turn at the pub; Ossa wanders the map, then lets go; the clock ends the turn.
 * Returns the written record, the frames that reached the room, and when development began and ended.
 */
async function recordedSteeredGame() {
  const fake = fakeContext({ table: walkers });
  const { game, recorder } = createRecordedGame({ ctx: fake.ctx, seed: 7, options: { maxMonths: 1, politics: false }, brain: createBrain({ gameId: 'steer', env: {} }), dir: null });
  game.start(walkers);
  const phase = () => game.viewFor(null).phase;
  let devStart: number | null = null;
  let devEnd: number | null = null;
  let framesInDev = 0;
  let extraFrames = { before: '', after: '' };
  for (let i = 0; i < 100_000 && !game.viewFor(null).finished; i++) {
    if (phase() === 'planning' || phase() === 'upkeep') readyAll(game as never);
    if (phase() === 'development' && devStart === null) {
      devStart = fake.ctx.now();
      game.handle(OSSA, { type: 'steer', x: 0.5, y: -0.5 });
      pressAct(game, fake, LENA);
      steerTo(game, fake, LENA, corral);
      pressAct(game, fake, LENA);
      steerTo(game, fake, LENA, [corral[0]!, ...pub]);
      game.handle(OSSA, { type: 'steer', x: 0, y: 0 });
      // A frame sent mid-step is output: it adds no step, no clock read, nothing to the record.
      extraFrames.before = JSON.stringify(recorder.record.events);
      for (let k = 0; k < 5; k++) recorder.ctx.frame({ tick: -1, at: 0, colonists: [], beats: ['not a step'] } satisfies DevFrame);
      extraFrames.after = JSON.stringify(recorder.record.events);
      pressAct(game, fake, LENA);
      continue;
    }
    if (devStart !== null && devEnd === null && phase() !== 'development') {
      devEnd = fake.ctx.now();
      framesInDev = fake.frames.length;
    }
    fake.advance(phase() === 'development' ? TICK : 100);
  }
  await new Promise<void>((r) => setImmediate(r));
  expect(recorder.finished, 'the record was written at game over').not.toBeNull();
  return { record: recorder.finished!, frames: fake.frames as DevFrame[], devStart: devStart!, devEnd: devEnd!, framesInDev, extraFrames, game, t0: recorder.record.t0 };
}

describe('the game record with DEV_STEER.on (HC-9, HC-10, C8 Task 2.2)', { timeout: 60_000 }, () => {
  it("a recorded development turn with steering replays identical; steer and act are recorded intents and the tick's firings recorded steps", async () => {
    const { record, devStart, devEnd, t0 } = await recordedSteeredGame();
    const inDev = record.events.filter((e) => e.at >= devStart - t0 && e.at <= devEnd - t0);
    expect(inDev.some((e) => e.type === 'intent' && e.intent.type === 'steer')).toBe(true);
    expect(inDev.some((e) => e.type === 'intent' && e.intent.type === 'act')).toBe(true);
    expect(inDev.filter((e) => e.type === 'fire').length).toBeGreaterThanOrEqual((devEnd - devStart) / TICK);
    expect(JSON.stringify(record)).not.toContain('"frame"');

    const result = await replay(JSON.parse(JSON.stringify(record)) as GameRecord<MuleIntent>);
    expect(result.identical).toBe(true);
    expect(result.stateHash.replayed).toBe(result.stateHash.recorded);

    // W-1: the record's size for the development turn, reported by the PR.
    const bytes = (events: unknown[]) => Buffer.byteLength(JSON.stringify(events));
    const ticks = (devEnd - devStart) / TICK;
    console.info(`W-1: record ${Buffer.byteLength(JSON.stringify(record))} B in all; development turn ${bytes(inDev)} B over ${inDev.length} events, ${ticks} ticks (${(bytes(inDev) / ticks).toFixed(1)} B a tick)`);
  });

  it("Task 2.2: a recorded game's frames reach a client, and a frame adds no step to the record", async () => {
    const { frames, framesInDev, devStart, devEnd, extraFrames, game } = await recordedSteeredGame();
    // The clock's end fires before a tick due the same ms, so the turn's last tick is the one before it.
    expect(framesInDev, 'one frame a tick reached the room, plus the five sent by hand').toBe((devEnd - devStart) / TICK - 1 + 5);
    expect(frames.filter((f) => f.tick >= 0).map((f) => f.tick)).toEqual(Array.from({ length: framesInDev - 5 }, (_, i) => i + 1));
    expect(extraFrames.after).toBe(extraFrames.before);
    expect(game.quiet?.({ type: 'steer', x: 1, y: 0 }), 'the recorded game is as quiet for a steer as the game').toBe(true);
    expect(game.quiet?.({ type: 'act' })).toBe(false);
  });
});
