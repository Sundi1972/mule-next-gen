import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WALK } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import type { SeatInfo } from '@tabletop/core';
import { claudeSeatAt, type SeatKind } from '../src/claude-seat/seats.js';
import { MuleGame } from '../src/mule-game.js';
import type { SdkModuleFake } from './brain-fakes.js';
import { fakeContext } from './fake-context.js';

/** The SDK module's constructor: records every client built, so a keyless game that builds one fails. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));

/** Two people and two built-in computer seats. */
const TABLE: SeatInfo[] = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Lena', isAi: false, color: 1 },
  { id: 's3', name: 'The Accountant', isAi: true, color: 2 },
  { id: 's4', name: 'The Gambler', isAi: true, color: 3 },
];
const LEAVER = 's2';
const STEP_MS = WALK.tickMs * 5;

/** The game hook C8 adds: the Room hands the game a seat that a person played and Claude plays from now on. */
type HandsOver = { seatBecameComputer(seat: SeatInfo & { kind: SeatKind }): void };

beforeEach(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const view = (game: MuleGame): MuleView => game.viewFor(null);

/** Steps the clock until `until` holds or the game is over; `present` press Ready wherever the table waits for people. */
async function play(game: MuleGame, fake: ReturnType<typeof fakeContext>, present: string[], until: (v: MuleView) => boolean, limitMs: number) {
  for (let t = 0; t < limitMs; t += STEP_MS) {
    const v = view(game);
    if (v.phase === 'gameOver' || until(v)) return v;
    if (v.phase === 'planning' || v.phase === 'upkeep' || (v.phase === 'auction' && v.auction?.stage === 'status')) {
      for (const id of present) {
        try {
          game.handle(id, { type: 'ready' });
        } catch {
          // Ready already, or nothing to be ready for in this stage.
        }
      }
    }
    fake.advance(STEP_MS);
    await Promise.resolve();
  }
  return view(game);
}

describe('C8: a player hands their own seat to Claude mid-game', () => {
  it('B-AC-8 (server): Lena hands her seat to Claude in month 1 and her phone drops; the game reaches game over without a Continue for her seat', async () => {
    const fake = fakeContext({ table: TABLE });
    const game = new MuleGame(fake.ctx, 10, { maxMonths: 2 });
    game.start(TABLE);
    await play(game, fake, ['s1', LEAVER], (v) => v.phase === 'production', 30 * 60_000);
    expect(view(game).phase, 'the premise: month 1 reaches production with both people playing').toBe('production');

    (game as unknown as HandsOver).seatBecameComputer({ ...TABLE[1]!, isAi: true, kind: 'claude' });
    game.connectionChanged(LEAVER, false);
    expect(claudeSeatAt(game, LEAVER), 'the seat is a Claude seat from now on').not.toBeNull();

    // Only the host plays on, and never presses Continue: a seat still a person's would hold every side pick (A-7).
    const end = await play(game, fake, ['s1'], () => false, 60 * 60_000);

    expect(end.phase).toBe('gameOver');
  });
});
