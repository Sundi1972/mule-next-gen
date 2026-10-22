import { describe, expect, it } from 'vitest';
import { GAME, WALK, type Good } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** Month 1 to the first good's status screen, nobody pressing anything before it. */
function toStatus() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  advance(PHASE_MS.planning);
  while (game.viewFor(null).phase !== 'auction') advance(1_000);
  const { good, stage } = game.viewFor(null).auction!;
  expect(stage).toBe('status');
  return { game, advance, good };
}

/** What s2 holds of the good and in money, as their own phone and the table see it. */
const holdings = (game: MuleGame, good: Good) => ({
  stock: game.viewFor('s2').me!.stock[good],
  money: game.viewFor(null).players.find((p) => p.id === 's2')!.money,
});

describe('a dropped phone in the goods auction', () => {
  it("FM-dropped-walker: a phone dropped while holding Up on the store's sell line sits the rest of the good out: off the board, Done, in no deal, and its stock and money never change again in that good", () => {
    const { game, advance, good } = toStatus();
    game.handle('s1', { type: 'declare', side: 'seller' });
    game.handle('s2', { type: 'declare', side: 'buyer' });
    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'ready' });
    advance(WALK.tickMs * 2);
    expect(game.viewFor(null).auction!.stage).toBe('walk');

    game.handle('s2', { type: 'walk', dir: 'up' });
    const walker = () => game.viewFor('s1').auction!.walkers.find((w) => w.id === 's2')!;
    for (let i = 0; i < 2_000 && walker().price < game.viewFor(null).auction!.storeSells!; i++) advance(WALK.tickMs);
    expect(walker().price, "s2 stands on the store's sell line").toBe(game.viewFor(null).auction!.storeSells);
    expect(walker().dir).toBe(1);

    const before = holdings(game, good);
    game.connectionChanged('s2', false);
    let ticks = 0;
    for (; ticks < 2_000; ticks++) {
      advance(WALK.tickMs);
      const view = game.viewFor('s1').auction;
      if (view?.good !== good || view.stage !== 'walk') break;
      expect(holdings(game, good), `tick ${ticks}`).toEqual(before);
      expect(view.deals.filter((d) => d.buyer === 's2' || d.seller === 's2'), `tick ${ticks}`).toEqual([]);
      expect(walker(), `tick ${ticks}`).toMatchObject({ side: 'pass', done: true });
    }
    expect(ticks, 'the good was still walking after the drop').toBeGreaterThan(10);
    expect(holdings(game, good)).toEqual(before);
  });

  it.each([
    ['on a side', () => {}],
    ['after passing', (game: MuleGame) => game.handle('s2', { type: 'declare', side: 'pass' })],
  ])('FM-dropped-status: a phone dropped on the status screen %s counts as Done: once s1 presses Ready the walk starts on the next tick', (_, before) => {
    const { game, advance, good } = toStatus();
    before(game);
    game.connectionChanged('s2', false);
    game.handle('s1', { type: 'ready' });
    advance(WALK.tickMs);
    expect(game.viewFor(null).auction).toMatchObject({ good, stage: 'walk' });
  });
});

// One human at the table with an AI seat, so nobody else is left to wait for.
const alone = [seats[0]!, seats[2]!];

/** Into the land grant with the only human, then `during` acts on the first lit plot; plays the grant out on its own ticks. */
function playGrant(during: (game: MuleGame) => void) {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(alone);
  game.handle('s1', { type: 'ready' });
  expect(game.viewFor('s1').phase).toBe('landGrant');
  const startedAt = ctx.now();
  during(game);
  const lit: string[] = [];
  for (let i = 0; i < 1_000 && game.viewFor(null).phase === 'landGrant'; i++) {
    const at = game.viewFor(null).lit;
    if (at) lit.push(`${at.x},${at.y}`);
    advance(GRANT_TICK_MS);
  }
  const view = game.viewFor(null);
  const plots = Object.fromEntries(view.players.map((p) => [p.id, p.plots]));
  return { lasted: ctx.now() - startedAt, lit, plots, next: view.phase };
}

describe('a dropped phone in the land grant', () => {
  it('FM-grant-reload: the only human drops during the land grant: the grant runs to its own end, exactly as if they sat there and claimed nothing', () => {
    const dropped = playGrant((game) => game.connectionChanged('s1', false));
    const idle = playGrant(() => {});
    expect(dropped.lit.length, 'the light kept moving after the drop').toBeGreaterThan(1);
    expect(dropped).toEqual(idle);
    expect(dropped.plots.s1).toBe(0);
    expect(dropped.lasted).toBeLessThanOrEqual(PHASE_MS.landGrant + GRANT_TICK_MS);
  });

  it('FM-grant-reload: the only human claims, drops and reconnects while the grant runs: their phone is back on the grant with the claim intact, and they claim the next lit plot', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(alone);
    game.handle('s1', { type: 'ready' });
    /** Moves the light on until it rests on a plot nobody owns yet, and returns it. */
    const nextFreeLit = () => {
      for (let i = 0; i < 100; i++) {
        const { lit, tiles } = game.viewFor('s1');
        if (lit && tiles.find((t) => t.x === lit.x && t.y === lit.y)!.owner === null) return lit;
        advance(GRANT_TICK_MS);
      }
      throw new Error('no free plot lit');
    };
    const first = nextFreeLit();
    game.handle('s1', { type: 'claim', ...first });

    game.connectionChanged('s1', false);
    advance(GRANT_TICK_MS * 2);
    game.connectionChanged('s1', true);
    const back = game.viewFor('s1');
    expect(back.phase).toBe('landGrant');
    expect(back.me!.claimsLeft).toBe(GAME.claimsPerGrant - 1);
    expect(back.tiles.filter((t) => t.owner === 's1').map(({ x, y }) => ({ x, y }))).toEqual([first]);

    const second = nextFreeLit();
    game.handle('s1', { type: 'claim', ...second });
    const after = game.viewFor('s1');
    expect(after.tiles.filter((t) => t.owner === 's1')).toHaveLength(2);
    expect(after.me!.claimsLeft).toBe(GAME.claimsPerGrant - 2);
  });

  it('FM-grant-reload negative: the only human presses Ready in the land grant: it still ends at once', () => {
    const passed = playGrant((game) => game.handle('s1', { type: 'ready' }));
    expect(passed.lasted).toBe(0);
    expect(passed.lit).toEqual([]);
    expect(passed.next).not.toBe('landGrant');
  });
});
