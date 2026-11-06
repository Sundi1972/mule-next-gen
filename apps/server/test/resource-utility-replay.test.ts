import { AI_VALUE, type GameState } from '@mule/engine';
import { afterEach, describe, expect, it } from 'vitest';
import type { BrainService } from '../src/brain/index.js';
import { chatter } from '../src/brain/chat.js';
import { MuleGame } from '../src/mule-game.js';
import { Recorder } from '../src/record.js';
import { replay } from '../src/replay.js';
import { fakeContext, seats } from './fake-context.js';

const saved = AI_VALUE.unit;
afterEach(() => {
  AI_VALUE.unit = saved;
});

/** Every seat plays Classic: no Claude call to record. */
const classic: BrainService = { deciderFor: () => null, writerFor: () => null, chatter: (seat, say) => chatter(seat.id, say), finish: () => {} };

describe('HC-3: the resource-utility model keeps a game replayable', () => {
  it('T-AC-11: a game with AI_VALUE.unit true replays from seed + actions to the same state hash', { timeout: 60_000 }, async () => {
    AI_VALUE.unit = true;
    const fake = fakeContext({});
    const options = { maxMonths: 2, politics: false };
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
    game.start(seats);
    for (let i = 0; i < 200_000 && !final; i++) {
      const phase = game.viewFor(null).phase;
      if (phase === 'planning' || phase === 'upkeep') for (const s of seats) if (!s.isAi && game.viewFor(null).phase === phase) game.handle(s.id, { type: 'ready' });
      // A good's side pick has no clock: each person not yet Done presses Ready there, through the recorder so the record
      // holds it, once an event's show has let go of the table.
      const view = game.viewFor(null);
      const pick = view.phase === 'auction' && view.auction?.stage === 'status' ? view.auction : null;
      if (pick && !(view.eventShow?.held && fake.ctx.now() < view.eventShow.endsAt))
        for (const s of seats) if (!s.isAi && !pick.walkers.find((w) => w.id === s.id)?.done) game.handle(s.id, { type: 'ready' });
      fake.advance(100);
    }
    expect(final, 'the game reached game over').not.toBeNull();
    await new Promise((resolve) => setImmediate(resolve));
    const record = JSON.parse(JSON.stringify(recorder.finished)) as NonNullable<typeof recorder.finished>;

    const result = await replay(record);

    expect(result.stateHash.replayed).toBe(record.outcome!.stateHash);
    expect(result.identical).toBe(true);
  });
});
