import type { GameState } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import { MuleGame } from '../src/mule-game.js';
import { Recorder, type MuleRecord } from '../src/record.js';
import { replay, ReplayDiverged } from '../src/replay.js';
import { fakeContext, seats } from './fake-context.js';

/** Every seat plays Classic: no Claude call to record. */
const classic: BrainService = { deciderFor: () => null, writerFor: () => null, chatter: (seat, say) => chatter(seat.id, say), finish: () => {} };

const isStep = (e: MuleRecord['events'][number]) => e.type !== 'notice' && e.type !== 'playbook';
const isHoldDown = (e: MuleRecord['events'][number]) => e.type === 'intent' && e.seat === 's1' && e.intent.type === 'walk' && e.intent.dir === 'down';

/**
 * A one-month game in which Heiko (s1) sells his spare Water to Mia (s2): he walks down, she walks up, he is stopped at
 * the amount he must hold (RULE-4), then holds ▼ again, which after WALK.shortHoldMs sells on into shortage. Returns the
 * record and what the engine showed at the stop and at the end of the good.
 */
async function recordedNeedStop() {
  const fake = fakeContext({});
  const options = { maxMonths: 1, politics: false };
  const recorder = new Recorder(fake.ctx, 31, options, classic, null);
  let final: GameState | null = null;
  const inner = new MuleGame(recorder.ctx, 31, {
    ...options,
    brain: recorder.brain,
    recordPlaybook: (entry) => recorder.playbook(entry),
    onGameOver: (state) => {
      final = structuredClone(state);
      recorder.gameOver(state);
    },
  });
  const game = recorder.wrap(inner);
  // The game keeps its engine state private; the test reads it to know when the stop has happened.
  const engine = () => (inner as unknown as { state: GameState }).state;
  game.start(seats);
  let walking = false;
  let pressed = false;
  let stop: { need: number; water: number } | null = null;
  let after: number | null = null;
  for (let i = 0; i < 200_000 && !final; i++) {
    const phase = game.viewFor(null).phase;
    if (phase === 'planning' || phase === 'upkeep') for (const s of seats) if (!s.isAi && game.viewFor(null).phase === phase) game.handle(s.id, { type: 'ready' });
    const view = game.viewFor(null);
    const a = engine().auction;
    const water = a?.good === 'water';
    const pick = view.phase === 'auction' && view.auction?.stage === 'status' ? view.auction : null;
    if (pick && !(view.eventShow?.held && fake.ctx.now() < view.eventShow.endsAt)) {
      const me = a!.status.find((r) => r.id === 's1')!;
      if (water && me.now > me.need && pick.walkers.find((w) => w.id === 's1')?.side !== 'seller') game.handle('s1', { type: 'declare', side: 'seller' });
      for (const s of seats) if (!s.isAi && !pick.walkers.find((w) => w.id === s.id)?.done) game.handle(s.id, { type: 'ready' });
    }
    if (water && a?.stage === 'walk') {
      const me = a.walkers.find((w) => w.id === 's1')!;
      const water = engine().players.find((p) => p.id === 's1')!.stock.water;
      if (!walking) {
        // Heiko walks down to sell; Mia walks up to buy, so they meet whatever the store still takes.
        game.handle('s1', { type: 'walk', dir: 'down' });
        game.handle('s2', { type: 'walk', dir: 'up' });
        walking = true;
      } else if (me.held && !pressed) {
        stop = { need: a.status.find((r) => r.id === 's1')!.need, water };
        // The conscious act: ▼ held again, and kept down.
        game.handle('s1', { type: 'walk', dir: 'down' });
        pressed = true;
      }
      if (pressed) after = water;
    }
    fake.advance(100);
  }
  expect(final, 'the game reached game over').not.toBeNull();
  await new Promise((resolve) => setImmediate(resolve));
  const record = JSON.parse(JSON.stringify(recorder.finished)) as MuleRecord;
  return { record, stop, after };
}

describe('RULE-4: the need stop and the conscious hold are replayed from the record', () => {
  it('T-AC-1′: a recorded game in which a seller is stopped at their need and then holds ▼ through replays identical; without the hold it does not', { timeout: 60_000 }, async () => {
    const { record, stop, after } = await recordedNeedStop();
    // The game the record holds really stopped Heiko at his need, and the hold really sold him into shortage.
    expect(stop, 'Heiko was stopped at his need').not.toBeNull();
    expect(stop!.water).toBe(stop!.need);
    expect(after!, 'the hold sold on below the need').toBeLessThan(stop!.need);
    expect(record.events.filter(isHoldDown)).toHaveLength(2);

    const result = await replay(record);
    expect(result.stateHash.replayed).toBe(record.outcome!.stateHash);
    expect(result.identical).toBe(true);

    // Negative: the record without the hold's `walk` intent plays otherwise.
    const dropped = JSON.parse(JSON.stringify(record)) as MuleRecord;
    const hold = dropped.events.findIndex((e, k) => isHoldDown(e) && dropped.events.slice(0, k).some(isHoldDown));
    dropped.events.splice(hold, 1);
    let seq = 0;
    for (const e of dropped.events) if (isStep(e)) e.seq = seq++;
    const outcome = await replay(dropped).then(
      (r) => r.identical,
      (err: unknown) => {
        if (!(err instanceof ReplayDiverged)) throw err;
        return false;
      },
    );
    expect(outcome).toBe(false);
  });
});
