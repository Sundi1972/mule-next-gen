import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import { GAME, LOTS, RuleError, TAX, WALK } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';

/** A context with a manual clock, so phase timers and the auction tick run instantly. */
function fakeContext() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const ctx: GameContext = {
    now: () => now,
    schedule: (ms, fn) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    changed: () => {},
  };
  const advance = (ms: number) => {
    now += ms;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now)) {
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i < 0) continue;
        timers.splice(i, 1);
        t.fn();
      }
    }
  };
  return { ctx, advance };
}

// Three humans at the kitchen table, in seat order.
const seats = [
  { id: 'b', name: 'Brix', isAi: false },
  { id: 'o', name: 'Ossa', isAi: false },
  { id: 'l', name: 'Lena', isAi: false },
];
const humans = seats.map((s) => s.id);

type Plot = { x: number; y: number };
const at = (p: Plot) => `${p.x}·${p.y}`;

/**
 * Plays month 1 through the same moves the phones send: in the land grant
 * Brix, then Lena, then Ossa each claim the next two plots that light up;
 * with `mule`, Brix fits a Food MULE to his first plot in development.
 * Everyone goes to the pub, the goods auction runs out, and the game stops
 * in month 2's planning.
 */
function toMonth2Planning(opts: { mule?: boolean } = {}) {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  const phases: string[] = [game.viewFor(null).phase];
  const note = () => {
    const p = game.viewFor(null).phase;
    if (phases.at(-1) !== p) phases.push(p);
  };
  for (const id of humans) game.handle(id, { type: 'ready' });
  note();
  const plots: Record<string, Plot[]> = { b: [], o: [], l: [] };
  for (const id of ['b', 'b', 'l', 'l', 'o', 'o']) {
    const lit = game.viewFor(id).lit!;
    game.handle(id, { type: 'claim', x: lit.x, y: lit.y });
    plots[id]!.push({ x: lit.x, y: lit.y });
    note();
    if (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  }
  note();
  expect(game.viewFor(null).phase).toBe('development');
  if (opts.mule) {
    game.handle('b', { type: 'buyMule' });
    game.handle('b', { type: 'outfit', outfit: 'food' });
    game.handle('b', { type: 'install', ...plots.b![0]! });
  }
  for (const id of humans) game.handle(id, { type: 'pub' });
  note();
  while (game.viewFor(null).phase === 'production') advance(1_000);
  note();
  for (let i = 0; i < 3_000 && game.viewFor(null).phase === 'auction'; i++) {
    for (const id of humans) game.handle(id, { type: 'ready' });
    advance(WALK.tickMs);
  }
  note();
  advance(PHASE_MS.upkeep);
  note();
  expect(game.viewFor(null).phase).toBe('planning');
  expect(game.viewFor(null).month).toBe(2);
  return { game, advance, plots, phases, note };
}

const money = (v: MuleView, id: string) => v.players.find((p) => p.id === id)!.money;
const tile = (v: MuleView, p: Plot) => v.tiles.find((t) => t.x === p.x && t.y === p.y)!;
const walker = (v: MuleView, id: string) => v.landAuction?.walkers.find((w) => w.id === id);

/** Everyone is ready in planning; the month-2 grant runs out with nobody claiming, and the land auction opens. */
function toLandAuction(game: MuleGame, advance: (ms: number) => void) {
  for (const id of humans) game.handle(id, { type: 'ready' });
  while (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  expect(game.viewFor(null).phase).toBe('landAuction');
}

/** Everyone presses Done on the intro, and the next tick starts the walk. */
function skipIntro(game: MuleGame, advance: (ms: number) => void) {
  expect(game.viewFor(null).landAuction!.stage).toBe('intro');
  for (const id of humans) game.handle(id, { type: 'ready' });
  advance(WALK.tickMs);
  expect(game.viewFor(null).landAuction!.stage).toBe('walk');
}

/** Holds Up on one phone until that seat's bid, as every screen shows it, reaches the target, then lets go. Returns the bid. */
function walkUpTo(game: MuleGame, advance: (ms: number) => void, id: string, target: number): number {
  game.handle(id, { type: 'walk', dir: 'up' });
  for (let i = 0; i < 200 && walker(game.viewFor(null), id)!.price < target; i++) advance(WALK.tickMs);
  game.handle(id, { type: 'walk', dir: 'stop' });
  return walker(game.viewFor(id), id)!.price;
}

/** Every buyer presses Done: the bell rings on the next tick. */
function ringBell(game: MuleGame, advance: (ms: number) => void, ids: string[]) {
  for (const id of ids) game.handle(id, { type: 'ready' });
  advance(WALK.tickMs);
  expect(game.viewFor(null).landAuction!.stage).toBe('result');
}

describe('land auction on the server', () => {
  it('UBER-AC-1 / B-AC-2: a listed plot goes to the highest bidder at their bid at the bell; the money moves less sales tax and the news names the sale', () => {
    const { game, advance, plots } = toMonth2Planning({ mule: true });
    const plot = plots.b![0]!;
    game.handle('b', { type: 'list', item: { kind: 'plot', ...plot }, minimum: 250, unsold: 'keep' });
    // A second lot nobody at the table can pay, so the intro shows who sits it out.
    game.handle('l', { type: 'list', item: { kind: 'plot', ...plots.l![0]! }, minimum: 5_000, unsold: 'keep' });
    toLandAuction(game, advance);

    // Intro of lot 1: both other seats see themselves as buyers; the seller watches.
    const intro = game.viewFor('o');
    expect(intro.phaseEndsAt).toBeNull();
    expect(intro.landAuction).toMatchObject({ stage: 'intro', total: LOTS.introMs / 1_000, number: 1, count: 2, lot: { seller: 'b', minimum: 250, item: { kind: 'plot', ...plot } } });
    expect(intro.landAuction!.next.map((l) => l.seller)).toEqual(['l']);
    expect(walker(intro, 'o')).toMatchObject({ side: 'buyer', done: false, price: intro.landAuction!.lo });
    expect(walker(intro, 'o')!.aside).toBeUndefined();
    expect(walker(game.viewFor('l'), 'l')).toMatchObject({ side: 'buyer' });
    expect(walker(intro, 'b')).toBeUndefined();
    const before = game.viewFor(null);

    // Ossa is ready first: every screen shows her done while Lena still reads the lot.
    game.handle('o', { type: 'ready' });
    expect(walker(game.viewFor('o'), 'o')!.done).toBe(true);
    expect(walker(game.viewFor('o'), 'l')!.done).toBe(false);
    skipIntro(game, advance);
    expect(game.viewFor('o').landAuction!.total).toBe(LOTS.walkMs / 1_000);
    const ossa = walkUpTo(game, advance, 'o', 310);
    const lena = walkUpTo(game, advance, 'l', 290);
    expect(ossa).toBeGreaterThanOrEqual(310);
    expect(lena).toBeGreaterThanOrEqual(290);
    expect(lena).toBeLessThan(ossa);
    expect(game.viewFor('b').landAuction!.leader).toEqual({ id: 'o', bid: ossa });
    ringBell(game, advance, ['o', 'l']);

    const after = game.viewFor('b');
    expect(after.landAuction!.result).toEqual({ kind: 'sold', buyer: 'o', price: ossa });
    expect(after.landAuction!.total).toBe(LOTS.resultMs / 1_000);
    expect(tile(after, plot).owner).toBe('o');
    expect(tile(after, plot).outfit).toBe('food');
    expect(money(after, 'o')).toBe(money(before, 'o') - ossa);
    expect(money(after, 'b')).toBe(money(before, 'b') + ossa - Math.round(ossa * TAX.salesTax));
    expect(money(after, 'l')).toBe(money(before, 'l'));
    expect(after.news[0]).toBe(`Ossa bought plot ${at(plot)} from Brix for ${ossa}.`);

    // Lot 2's intro: nobody but its seller has 5000, so both sit it out for money.
    // The fake clock runs one tick per advance, so the result's clock is run down tick by tick.
    for (let t = 0; t < LOTS.resultMs; t += WALK.tickMs) advance(WALK.tickMs);
    const second = game.viewFor('o');
    expect(second.landAuction).toMatchObject({ stage: 'intro', number: 2, count: 2, lot: { seller: 'l' } });
    expect(walker(second, 'o')).toMatchObject({ side: 'pass', aside: 'money' });
    expect(walker(second, 'b')).toMatchObject({ side: 'pass', aside: 'money' });
    expect(walker(second, 'l')).toBeUndefined();

    // With no buyer the bell rings as the intro ends; the result still says why each seat sat it out.
    for (let i = 0; i < 200 && game.viewFor(null).landAuction!.stage === 'intro'; i++) advance(WALK.tickMs);
    const unsold = game.viewFor('o');
    expect(unsold.landAuction).toMatchObject({ stage: 'result', number: 2, result: { kind: 'kept' } });
    expect(walker(unsold, 'o')).toMatchObject({ aside: 'money' });
    expect(walker(unsold, 'b')).toMatchObject({ aside: 'money' });

    for (let i = 0; i < 200 && game.viewFor(null).phase === 'landAuction'; i++) advance(WALK.tickMs);
    const dev = game.viewFor(null);
    expect(dev.phase).toBe('development');
    expect(dev.landAuction).toBeNull();
    expect(dev.listings).toEqual([]);
    expect(dev.news).toContain(`Nobody bid 5000 on plot ${at(plots.l![0]!)}: Lena keeps it.`);
    expect(tile(dev, plots.l![0]!).owner).toBe('l');
  });

  it('B-AC-1: a listing shows in every seat\'s view and the board\'s, and takes a lot slot; nobody can list a plot that isn\'t theirs', () => {
    const { game, plots } = toMonth2Planning();
    const lenas = plots.l![0]!;
    expect(game.viewFor(null).lotSlots).toEqual({ used: 0, max: LOTS.maxLotsPerMonth });

    expect(() => game.handle('o', { type: 'list', item: { kind: 'plot', ...lenas }, minimum: 250, unsold: 'keep' })).toThrow(RuleError);
    expect(game.viewFor('o').listings).toEqual([]);
    expect(game.viewFor('o').lotSlots.used).toBe(0);

    game.handle('l', { type: 'list', item: { kind: 'plot', ...lenas }, minimum: 250, unsold: 'keep' });
    const expected = {
      id: `plot-${lenas.x}-${lenas.y}`,
      seller: 'l',
      item: { kind: 'plot', x: lenas.x, y: lenas.y },
      minimum: 250,
      unsold: 'keep',
      storePays: Math.round(LOTS.storePlotShare * GAME.plotScore),
    };
    for (const id of [...humans, null]) {
      const v = game.viewFor(id);
      expect(v.listings).toEqual([expected]);
      expect(v.lotSlots).toEqual({ used: 1, max: LOTS.maxLotsPerMonth });
    }

    game.handle('l', { type: 'unlist', id: expected.id });
    expect(game.viewFor('b').listings).toEqual([]);
    expect(game.viewFor('b').lotSlots.used).toBe(0);
  });

  it('B-AC-3: a lot nobody bids the minimum on is kept with "keep" (a 240 bid never wins a 250 lot), and bought by the store with "store"', () => {
    // keep: Ossa stops under the minimum.
    {
      const { game, advance, plots } = toMonth2Planning();
      const plot = plots.b![0]!;
      game.handle('b', { type: 'list', item: { kind: 'plot', ...plot }, minimum: 250, unsold: 'keep' });
      toLandAuction(game, advance);
      const before = game.viewFor(null);
      skipIntro(game, advance);
      // A tick that comes a whole walk late moves a bid no further than three ticks would, and the lot keeps walking.
      const start = game.viewFor(null);
      game.handle('o', { type: 'walk', dir: 'up' });
      advance(LOTS.walkMs);
      const stalled = game.viewFor(null);
      expect(stalled.landAuction!.stage).toBe('walk');
      expect(walker(stalled, 'o')!.at - walker(start, 'o')!.at).toBeLessThanOrEqual((start.landAuction!.speed * 3 * WALK.tickMs) / 1_000);
      const bid = walkUpTo(game, advance, 'o', 238);
      expect(bid).toBeLessThan(250);
      expect(game.viewFor('o').landAuction!.leader).toBeNull();
      ringBell(game, advance, ['o', 'l']);
      const after = game.viewFor('b');
      expect(after.landAuction!.result).toEqual({ kind: 'kept' });
      expect(tile(after, plot).owner).toBe('b');
      for (const id of humans) expect(money(after, id)).toBe(money(before, id));
      expect(after.news[0]).toBe(`Nobody bid 250 on plot ${at(plot)}: Brix keeps it.`);
    }
    // store: nobody bids the minimum. Lena's phone drops, then Ossa's while she holds Up, and Brix's:
    // a dropped phone counts as done, its bid stands where it was, and the lot still runs to its bell.
    {
      const { game, advance, plots } = toMonth2Planning({ mule: true });
      const plot = plots.b![0]!;
      game.handle('b', { type: 'list', item: { kind: 'plot', ...plot }, minimum: 250, unsold: 'store' });
      const storePays = game.viewFor('b').listings[0]!.storePays;
      expect(storePays).toBe(Math.round(LOTS.storePlotShare * GAME.plotScore));
      toLandAuction(game, advance);
      game.connectionChanged('l', false);
      const before = game.viewFor(null);
      expect(tile(before, plot).outfit).toBe('food');
      game.handle('o', { type: 'ready' });
      advance(WALK.tickMs);
      expect(game.viewFor(null).landAuction!.stage).toBe('walk');
      game.handle('o', { type: 'walk', dir: 'up' });
      advance(WALK.tickMs);
      const dropped = walker(game.viewFor(null), 'o')!.at;
      expect(dropped).toBeGreaterThan(walker(before, 'o')!.at);
      game.connectionChanged('b', false);
      game.connectionChanged('o', false);
      expect(game.viewFor(null).phase).toBe('landAuction');
      advance(WALK.tickMs);
      const after = game.viewFor('b');
      expect(after.phase).toBe('landAuction');
      expect(after.landAuction!.result).toEqual({ kind: 'store', price: storePays });
      expect(walker(after, 'o')!.at).toBe(dropped);
      expect(money(after, 'b')).toBe(money(before, 'b') + storePays);
      expect(money(after, 'o')).toBe(money(before, 'o'));
      expect(tile(after, plot).owner).toBeNull();
      expect(tile(after, plot).outfit).toBeNull();
      expect(after.storeMules).toBe(before.storeMules + 1);
      expect(after.news[0]).toBe(`The store bought plot ${at(plot)} from Brix for ${storePays}.`);
    }
  });

  it('B-AC-4: a MULE won at the land auction is in the winner\'s hand when development starts, and the seller\'s plot has none', () => {
    const { game, advance, plots } = toMonth2Planning({ mule: true });
    const plot = plots.b![0]!;
    game.handle('b', { type: 'list', item: { kind: 'mule', ...plot }, minimum: 100, unsold: 'keep' });
    expect(game.viewFor('o').listings.map((l) => l.item)).toEqual([{ kind: 'mule', x: plot.x, y: plot.y, outfit: 'food' }]);
    toLandAuction(game, advance);
    const before = game.viewFor(null);
    skipIntro(game, advance);
    // Lena bids past the board's top (twice the minimum): the board grows a margin at both ends, as the goods board does.
    const bid = walkUpTo(game, advance, 'l', 210);
    const grown = game.viewFor(null);
    expect(grown.landAuction!.hi).toBeGreaterThan(walker(grown, 'l')!.at);
    expect(grown.landAuction!.lo).toBeLessThan(walker(grown, 'o')!.at);
    ringBell(game, advance, ['o', 'l']);
    const sold = game.viewFor('l');
    expect(sold.landAuction!.result).toEqual({ kind: 'sold', buyer: 'l', price: bid });
    // The bell took the MULE off the plot; the lot still names its outfit.
    expect(tile(sold, plot).outfit).toBeNull();
    expect(sold.landAuction!.lot.item).toEqual({ kind: 'mule', x: plot.x, y: plot.y, outfit: 'food' });
    expect(sold.news[0]).toBe(`Lena bought the MULE on plot ${at(plot)} from Brix for ${bid}.`);

    for (let i = 0; i < 200 && game.viewFor(null).phase === 'landAuction'; i++) advance(WALK.tickMs);
    const dev = game.viewFor('l');
    expect(dev.phase).toBe('development');
    expect(dev.me!.carriedMule).toBe('food');
    expect(tile(dev, plot).owner).toBe('b');
    expect(tile(dev, plot).outfit).toBeNull();
    expect(money(dev, 'l')).toBe(money(before, 'l') - bid);
  });

  it('B-AC-6: a fifth listing in a month is refused with "The auction is full this month", and the view shows 4 of 4 slots', () => {
    const { game, plots } = toMonth2Planning();
    game.handle('b', { type: 'list', item: { kind: 'plot', ...plots.b![0]! }, minimum: 250, unsold: 'keep' });
    // A second lot from one player is fine while slots remain.
    game.handle('b', { type: 'list', item: { kind: 'plot', ...plots.b![1]! }, minimum: 250, unsold: 'keep' });
    expect(game.viewFor('b').lotSlots.used).toBe(2);
    game.handle('l', { type: 'list', item: { kind: 'plot', ...plots.l![0]! }, minimum: 250, unsold: 'keep' });
    game.handle('l', { type: 'list', item: { kind: 'plot', ...plots.l![1]! }, minimum: 250, unsold: 'keep' });

    expect(() => game.handle('o', { type: 'list', item: { kind: 'plot', ...plots.o![0]! }, minimum: 250, unsold: 'keep' })).toThrow('The auction is full this month');
    const v = game.viewFor('o');
    expect(v.lotSlots).toEqual({ used: 4, max: 4 });
    expect(v.listings.map((l) => l.seller)).toEqual(['b', 'b', 'l', 'l']);
  });

  it('T-AC-5: with nothing listed the game goes from the land grant straight to development', () => {
    const { game, advance, phases, note } = toMonth2Planning();
    expect(phases).toEqual(['planning', 'landGrant', 'development', 'production', 'auction', 'upkeep', 'planning']);
    for (const id of humans) game.handle(id, { type: 'ready' });
    for (let i = 0; i < 500 && game.viewFor(null).phase === 'landGrant'; i++) {
      advance(GRANT_TICK_MS);
      note();
    }
    expect(phases.slice(-3)).toEqual(['planning', 'landGrant', 'development']);
    expect(game.viewFor(null).landAuction).toBeNull();
  });
});
