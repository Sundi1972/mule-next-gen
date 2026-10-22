import { describe, expect, it } from 'vitest';
import { WALK, type GameState } from '@mule/engine';
import { MuleGame, PHASE_MS } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** The engine's state behind the game: the source of truth the view must match. */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

describe('a dropped phone in the goods auction', () => {
  it('FM-dropped-walker: a phone dropped while holding Up: its walker stops where it was, counts as Done, and never trades again in that good', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    advance(PHASE_MS.planning);
    while (game.viewFor('s1').phase !== 'auction') advance(1_000);
    game.handle('s1', { type: 'declare', side: 'seller' });
    game.handle('s2', { type: 'declare', side: 'buyer' });
    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'ready' });
    advance(WALK.tickMs * 2);
    const { good, stage } = game.viewFor(null).auction!;
    expect(stage).toBe('walk');

    game.handle('s2', { type: 'walk', dir: 'up' });
    advance(WALK.tickMs * 3);
    const walker = () => game.viewFor('s1').auction!.walkers.find((w) => w.id === 's2')!;
    expect(walker().at, 's2 walked up before the drop').toBeGreaterThan(0);
    const stock = engineOf(game).players.find((p) => p.id === 's2')!.stock[good];

    const droppedAt = walker().at;
    game.connectionChanged('s2', false);
    let ticks = 0;
    for (; ticks < 2_000; ticks++) {
      advance(WALK.tickMs);
      const view = game.viewFor('s1').auction;
      if (view?.good !== good || view.stage !== 'walk') break;
      expect(walker().at, `tick ${ticks}`).toBe(droppedAt);
      expect(view.deals.filter((d) => d.buyer === 's2' || d.seller === 's2')).toEqual([]);
      expect(walker()).toMatchObject({ done: true, dir: 0 });
    }
    expect(ticks, 'the good was still walking after the drop').toBeGreaterThan(10);
    expect(engineOf(game).players.find((p) => p.id === 's2')!.stock[good]).toBe(stock);
  });
});
