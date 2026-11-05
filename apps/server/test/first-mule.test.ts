import { DEV_STEER, DEVELOPMENT, GOODS, mulePrice, mulePriceFor, outfitCostFor, RuleError, SPECIES_PERK, tileIndex, type GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import type { SeatInfo } from '@tabletop/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, pressThroughSidePick, readyAll, tapThere, toDevelopment, walkers } from './fake-context.js';

/**
 * A-1 (arcade AM-6, HC-3): in month 1 the one development clock stands full until every seat is in. A present seat is
 * in once its first MULE is installed, it owns no plot, or it has ended its turn; an away seat is in. The host's
 * Continue starts it past anyone not in. Months 2 and later start the clock at once.
 */

const LENA = 's1';
const OSSA = 's2';
const FULL_MS = DEVELOPMENT.fullSeconds * 1_000;

/** A free plot next to the store, so a walk there is short. */
function plotNearStore(state: GameState, skip = 0): number {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const near = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null && Math.abs(t.x - store.x) + Math.abs(t.y - store.y) <= 2);
  const t = near[skip]!;
  return tileIndex(state.width, t.x, t.y);
}

/** Lena (the host) and Ossa in month 1's development; `owners` names who owns a plot near the store. */
function firstMonth(owners: string[]) {
  const plots: Record<string, number> = {};
  const g = toDevelopment({
    players: walkers,
    firstMonthWaits: true,
    prepare: (state) => {
      owners.forEach((id, k) => {
        const i = plotNearStore(state, k);
        state.tiles[i]!.owner = id;
        plots[id] = i;
      });
    },
  });
  const xy = (id: string) => ({ x: plots[id]! % g.state.width, y: Math.floor(plots[id]! / g.state.width) });
  /** The seat buys, outfits and installs its first MULE, the fake clock running through each walk. */
  const installFirst = (id: string) => {
    tapThere(g.game, g, id, { type: 'buyMule' });
    tapThere(g.game, g, id, { type: 'outfit', outfit: 'food' });
    tapThere(g.game, g, id, { type: 'install', ...xy(id) });
  };
  return { ...g, installFirst };
}

const clockOf = (view: MuleView) => ({ devEndsAt: view.me?.devEndsAt ?? null, phaseEndsAt: view.phaseEndsAt, waitsFor: view.clockWaitsFor });

describe('A-1: month 1’s development clock waits for every first MULE', () => {
  it('A-1: in month 1 the clock stays null until every seat is in; then the full clock starts', () => {
    const { game, ctx, installFirst, advance } = firstMonth([LENA, OSSA]);
    expect(clockOf(game.viewFor(LENA))).toEqual({ devEndsAt: null, phaseEndsAt: null, waitsFor: [LENA, OSSA] });

    installFirst(LENA);
    advance(60_000);
    expect(game.viewFor(null).phase, 'a minute on, the waiting clock has not run out').toBe('development');
    expect(clockOf(game.viewFor(OSSA))).toEqual({ devEndsAt: null, phaseEndsAt: null, waitsFor: [OSSA] });

    installFirst(OSSA);
    const started = ctx.now();
    const view = game.viewFor(LENA);
    expect(view.clockWaitsFor, 'once everyone is in, the view no longer says the clock waits').toBeUndefined();
    expect(view.me!.devEndsAt).toBe(started + FULL_MS);
    expect(view.phaseEndsAt).toBe(started + FULL_MS);
  });

  it('A-1: a seat that owns no plot counts as in', () => {
    const { game, ctx, installFirst } = firstMonth([LENA]);
    expect(game.viewFor(null).clockWaitsFor).toEqual([LENA]);
    installFirst(LENA);
    expect(game.viewFor(LENA).me!.devEndsAt).toBe(ctx.now() + FULL_MS);
  });

  it('A-1: a seat that went to the pub counts as in; while the clock waits the pub pays as for the full clock', () => {
    const g = firstMonth([LENA, OSSA]);
    const { game, ctx, installFirst } = g;
    tapThere(game, g, OSSA, { type: 'pub' });
    const { base, start, perMonth } = DEVELOPMENT.pub;
    expect(game.viewFor(null).news[0], 'the pub paid for the full clock').toBe(`Ossa went to the pub and won ${base + start + perMonth}.`);
    expect(game.viewFor(null).clockWaitsFor).toEqual([LENA]);
    installFirst(LENA);
    expect(game.viewFor(LENA).me!.devEndsAt).toBe(ctx.now() + FULL_MS);
  });

  it('A-1: a seat that pressed Ready counts as in', () => {
    const { game, ctx, installFirst } = firstMonth([LENA, OSSA]);
    game.handle(OSSA, { type: 'ready' });
    expect(game.viewFor(null).clockWaitsFor).toEqual([LENA]);
    installFirst(LENA);
    expect(game.viewFor(LENA).me!.devEndsAt).toBe(ctx.now() + FULL_MS);
  });

  it('A-1: an away seat counts as in, and stops counting once it is back', () => {
    const { game, ctx, installFirst } = firstMonth([LENA, OSSA]);
    game.connectionChanged(OSSA, false);
    expect(game.viewFor(null).clockWaitsFor).toEqual([LENA]);
    game.connectionChanged(OSSA, true);
    expect(game.viewFor(null).clockWaitsFor, 'back before the clock starts, Ossa is waited for again').toEqual([LENA, OSSA]);
    game.connectionChanged(OSSA, false);
    installFirst(LENA);
    expect(game.viewFor(LENA).me!.devEndsAt).toBe(ctx.now() + FULL_MS);
  });

  it('A-1: the host’s Continue starts the full clock past anyone not in, and the news names them', () => {
    const { game, ctx } = firstMonth([LENA, OSSA]);
    game.handle(LENA, { type: 'continue' });
    const view = game.viewFor(OSSA);
    expect(view.me!.devEndsAt).toBe(ctx.now() + FULL_MS);
    expect(view.clockWaitsFor).toBeUndefined();
    expect(view.news[0]).toBe('Lena started the clock without Ossa.');
  });

  it('A-1: a Continue from anyone but the host throws a RuleError, and once the clock runs the host’s does too', () => {
    const { game, installFirst } = firstMonth([LENA, OSSA]);
    expect(() => game.handle(OSSA, { type: 'continue' })).toThrow(RuleError);
    installFirst(LENA);
    installFirst(OSSA);
    expect(() => game.handle(LENA, { type: 'continue' })).toThrow(RuleError);
  });

  it("A-1: once in, you wait: Lena's MULE is in and Ossa's still to come, so her buy, install, analyse and filter are refused, her money and the corral unchanged", () => {
    const { game, installFirst } = firstMonth([LENA, OSSA]);
    installFirst(LENA);
    const before = game.viewFor(LENA);
    const money = before.players.find((p) => p.id === LENA)!.money;
    const plot = before.tiles.find((t) => t.owner === LENA)!;
    for (const intent of [{ type: 'buyMule' }, { type: 'install', x: plot.x, y: plot.y }, { type: 'analyse', x: plot.x, y: plot.y }, { type: 'filter', x: plot.x, y: plot.y }] as const)
      expect(() => game.handle(LENA, intent), intent.type).toThrow(new RuleError("Waiting for the others' first MULEs"));
    const after = game.viewFor(LENA);
    expect(after.players.find((p) => p.id === LENA)!.money).toBe(money);
    expect(after.storeMules).toBe(before.storeMules);
    expect(after.players.find((p) => p.id === LENA)!.colonist?.walk ?? null, 'a refused tap sets no walk off').toBeNull();
    expect(after.clockWaitsFor).toEqual([OSSA]);
  });

  it('A-1: once in, you wait, but the pub is open', () => {
    const g = firstMonth([LENA, OSSA]);
    g.installFirst(LENA);
    tapThere(g.game, g, LENA, { type: 'pub' });
    expect(g.game.viewFor(LENA).players.find((p) => p.id === LENA)!.doneDeveloping).toBe(true);
  });

  it('A-1 (negative): a seat not yet in buys its first MULE as ever while another seat waits', () => {
    const { game, installFirst, ctx, advance } = firstMonth([LENA, OSSA]);
    installFirst(LENA);
    const corral = game.viewFor(null).storeMules;
    game.handle(OSSA, { type: 'buyMule' });
    const walk = game.viewFor(null).players.find((p) => p.id === OSSA)!.colonist!.walk!;
    advance(walk.arrivesAt - ctx.now());
    expect(game.viewFor(OSSA).me!.carriedMule).toBe('empty');
    expect(game.viewFor(null).storeMules).toBe(corral - 1);
  });

  it('A-1: month 2 is unchanged: the clock starts at once, whoever has no MULE yet', () => {
    const { game, ctx, state, advance } = firstMonth([]);
    for (const id of [LENA, OSSA]) game.handle(id, { type: 'pub' });
    for (let i = 0; i < 100_000 && !(state.month === 2 && game.viewFor(null).phase === 'development'); i++) {
      if (game.viewFor(null).phase === 'planning') {
        // Both own a plot with no MULE as month 2 opens: under month 1's rule neither would be in.
        state.tiles[plotNearStore(state, 0)]!.owner = LENA;
        state.tiles[plotNearStore(state, 0)]!.owner = OSSA;
        readyAll(game);
      }
      // The month end waits for every Ready too.
      if (game.viewFor(null).phase === 'upkeep') readyAll(game);
      // A good's side pick has no clock either (A-7).
      pressThroughSidePick(game);
      if (!(state.month === 2 && game.viewFor(null).phase === 'development')) advance(100);
    }
    expect(state.month).toBe(2);
    const view = game.viewFor(LENA);
    expect(view.phase).toBe('development');
    expect(view.clockWaitsFor).toBeUndefined();
    expect(view.me!.devEndsAt).toBe(ctx.now() + FULL_MS);
  });
});

describe('A-1: games with AI seats still finish month 1 (WS1’s stall seeds)', () => {
  // Each row plays whole AI months on the fake clock: the outcome is fixed by the seed, but the wall time is not, and a
  // loaded CI runner took 5.2 s against vitest's 5 s default. The budget is for the runner, not for the game.
  const SLOW_ROW_MS = 30_000;
  // The server's planning ends on a human's Ready, so a table of AIs alone never leaves it: one idle human with no
  // plot sits in. Present and plotless, Hal counts as in, so only the four AIs decide when the clock starts.
  const table: SeatInfo[] = [{ id: 'h', name: 'Hal', isAi: false, color: 4 }, ...['Ada', 'Bo', 'Cy', 'Di'].map((name, i) => ({ id: `a${i}`, name, isAi: true, color: i }))];

  it.each([103, 233, 3])('A-1: seed %i: four AI seats, politics on, one idle human: month 1 ends', (seed) => {
    const fake = fakeContext({ table });
    const game = new MuleGame(fake.ctx, seed, { politics: true });
    game.start(table);
    let devFrom: number | null = null;
    let devMs = 0;
    for (let i = 0; i < 20_000; i++) {
      const { month, phase } = game.viewFor(null);
      if (month !== 1) break;
      if (phase === 'planning' || phase === 'landGrant' || phase === 'upkeep') readyAll(game);
      if (phase === 'development' && devFrom === null) devFrom = fake.ctx.now();
      if (phase !== 'development' && devFrom !== null && devMs === 0) devMs = fake.ctx.now() - devFrom;
      // Nor does a good's side pick (A-7): the idle human picks there as in the other phases that wait for him.
      pressThroughSidePick(game);
      fake.advance(100);
    }
    expect(game.viewFor(null).month, 'month 1 ended').toBe(2);
    expect(devMs, 'development ran its full clock').toBeGreaterThanOrEqual(FULL_MS);
    expect(devMs, 'the wait and the full clock, never a stall').toBeLessThanOrEqual(2 * FULL_MS);
  }, SLOW_ROW_MS);

  it('A-1: once in, an AI waits or goes to the pub while a human holds the clock; nothing it does changes the table, and the host can still start the clock', () => {
    const fake = fakeContext({ table });
    const game = new MuleGame(fake.ctx, 103, { politics: true });
    game.start(table);
    const state = (game as unknown as { state: GameState }).state;
    for (let i = 0; i < 20_000 && game.viewFor(null).phase !== 'development'; i++) {
      const phase = game.viewFor(null).phase;
      if (phase === 'planning' && !state.tiles.some((t) => t.owner === 'h')) state.tiles[plotNearStore(state, 0)]!.owner = 'h';
      if (phase === 'planning' || phase === 'landGrant' || phase === 'upkeep') readyAll(game);
      fake.advance(100);
    }
    expect(state.tiles.some((t) => t.owner === 'h'), 'Hal owns a plot, so the clock waits for him').toBe(true);
    for (let t = 0; t < 4 * FULL_MS; t += 100) fake.advance(100);
    expect(game.viewFor(null).clockWaitsFor, 'four clocks on, only idle Hal is still to come').toEqual(['h']);
    const settled = game.viewFor(null);
    for (let t = 0; t < FULL_MS; t += 100) fake.advance(100);
    const later = game.viewFor(null);
    for (const p of later.players.filter((q) => q.isAi)) {
      const was = settled.players.find((q) => q.id === p.id)!;
      expect({ money: p.money, walking: p.colonist?.walk ?? null }, `${p.name} waits once in`).toEqual({ money: was.money, walking: null });
    }
    expect(later.storeMules).toBe(settled.storeMules);
    game.handle('h', { type: 'continue' });
    for (let i = 0; i < 20_000 && game.viewFor(null).phase === 'development'; i++) fake.advance(100);
    expect(game.viewFor(null).phase).toBe('production');
  }, SLOW_ROW_MS);
});

describe('A-1 (AM-33): a seat that cannot get a first MULE counts as in, so the clock never waits on it', () => {
  // The tap path (devSteer off): the rule is isIn's, the same for the floor, whose tick re-checks it every tick.
  let was = DEV_STEER.on;
  beforeAll(() => {
    was = DEV_STEER.on;
    DEV_STEER.on = false;
  });
  afterAll(() => {
    DEV_STEER.on = was;
  });

  /** Lena and Ossa own a plot each; `prepare` sets the corral and the purses up before development. */
  function stagedCorral(prepare: (state: GameState) => void) {
    const plots: Record<string, number> = {};
    const g = toDevelopment({
      players: walkers,
      firstMonthWaits: true,
      prepare: (state) => {
        [LENA, OSSA].forEach((id, k) => {
          const i = plotNearStore(state, k);
          state.tiles[i]!.owner = id;
          plots[id] = i;
        });
        prepare(state);
      },
    });
    const xy = (id: string) => ({ x: plots[id]! % g.state.width, y: Math.floor(plots[id]! / g.state.width) });
    return { ...g, xy };
  }

  it('AM-33: the last MULE sells while Lena still needs one: once Ossa installs it, the clock starts, Lena left out', () => {
    const g = stagedCorral((state) => {
      state.store.mules = 1;
    });
    expect(g.game.viewFor(null).clockWaitsFor, 'both still to come').toEqual([LENA, OSSA]);
    tapThere(g.game, g, OSSA, { type: 'buyMule' });
    // The corral is empty and Lena leads none: she cannot get a first MULE, so only Ossa is still to come.
    expect(g.game.viewFor(null).clockWaitsFor, 'Lena can no longer get one').toEqual([OSSA]);
    tapThere(g.game, g, OSSA, { type: 'outfit', outfit: 'food' });
    tapThere(g.game, g, OSSA, { type: 'install', ...g.xy(OSSA) });
    const view = g.game.viewFor(LENA);
    expect(view.clockWaitsFor, 'nobody is waited for').toBeUndefined();
    expect(view.me!.devEndsAt, 'the full clock runs').toBe(g.ctx.now() + FULL_MS);
  });

  it('AM-33: a seat that cannot pay the corral\'s price is not waited for', () => {
    const g = stagedCorral((state) => {
      state.players.find((p) => p.id === LENA)!.money = 0;
    });
    expect(g.game.viewFor(null).clockWaitsFor, 'only Ossa, who can buy, is still to come').toEqual([OSSA]);
  });

  it("AM-33 (negative): a Gearling that can pay its own lower price is still waited for, though it can't pay the full one", () => {
    const g = stagedCorral((state) => {
      const lena = state.players.find((p) => p.id === LENA)!;
      lena.species = 'gearling';
      const full = mulePrice(state);
      // Enough for her own MULE and her cheapest outfit (AM-33's extension), not for a MULE at the full price.
      lena.money = mulePriceFor(state, LENA) + cheapestOutfit(state, LENA);
      expect(lena.money, 'below the full MULE price with the same outfit').toBeLessThan(full + cheapestOutfit(state, LENA));
    });
    expect(g.game.viewFor(null).clockWaitsFor, 'Lena can buy at her price').toEqual([LENA, OSSA]);
  });

  it('AM-33: a seat that can pay for a MULE but for no outfit with it is not waited for', () => {
    const g = stagedCorral((state) => {
      state.players.find((p) => p.id === LENA)!.money = mulePriceFor(state, LENA) + cheapestOutfit(state, LENA) - 1;
    });
    expect(g.game.viewFor(null).clockWaitsFor, 'Lena could buy a MULE but never install it').toEqual([OSSA]);
  });

  it('AM-33: a seat in only because it cannot outfit may still buy its MULE, and is not told it waits', () => {
    const g = stagedCorral((state) => {
      state.players.find((p) => p.id === LENA)!.money = mulePriceFor(state, LENA) + cheapestOutfit(state, LENA) - 1;
    });
    tapThere(g.game, g, LENA, { type: 'buyMule' });
    expect(g.game.viewFor(LENA).me!.carriedMule, 'the engine sold it').toBe('empty');
    expect(g.game.viewFor(null).news.join(' | ')).not.toContain('Waiting for the others');
  });

  it('AM-33 (negative): a seat already in, with money for a MULE but not an outfit, still waits to buy', () => {
    const g = stagedCorral(() => {});
    tapThere(g.game, g, LENA, { type: 'buyMule' });
    tapThere(g.game, g, LENA, { type: 'outfit', outfit: 'food' });
    tapThere(g.game, g, LENA, { type: 'install', ...g.xy(LENA) });
    expect(g.game.viewFor(null).clockWaitsFor, 'Lena is in: her MULE is installed').toEqual([OSSA]);
    const lena = g.state.players.find((p) => p.id === LENA)!;
    lena.money = mulePriceFor(g.state, LENA);
    const corral = g.state.store.mules;
    expect(() => g.game.handle(LENA, { type: 'buyMule' })).toThrow(new RuleError("Waiting for the others' first MULEs"));
    expect([lena.carriedMule, g.state.store.mules], 'no second MULE, the corral unchanged').toEqual([null, corral]);
  });

  it('AM-33: a seat leading an empty MULE it cannot pay to outfit is not waited for', () => {
    const g = stagedCorral((state) => {
      const lena = state.players.find((p) => p.id === LENA)!;
      lena.carriedMule = 'empty';
      lena.money = cheapestOutfit(state, LENA) - 1;
    });
    expect(g.game.viewFor(null).clockWaitsFor, 'Lena can never outfit it').toEqual([OSSA]);
    const able = stagedCorral((state) => {
      const lena = state.players.find((p) => p.id === LENA)!;
      lena.carriedMule = 'empty';
      lena.money = cheapestOutfit(state, LENA);
    });
    expect(able.game.viewFor(null).clockWaitsFor, 'with exactly the cheapest outfit she can still outfit it').toEqual([LENA, OSSA]);
  });

  it('AM-33 (negative): a seat that can pay for a MULE and its cheapest outfit is still waited for', () => {
    const g = stagedCorral((state) => {
      state.players.find((p) => p.id === LENA)!.money = mulePriceFor(state, LENA) + cheapestOutfit(state, LENA);
    });
    expect(g.game.viewFor(null).clockWaitsFor, 'Lena can buy, outfit and install').toEqual([LENA, OSSA]);
  });

  it("AM-33: a seat that can't pay is told why when it tries to buy, not that it waits", () => {
    const g = stagedCorral((state) => {
      state.players.find((p) => p.id === LENA)!.money = 0;
    });
    // A tap buy is a walk to the corral; the engine's refusal comes on arrival, in the news.
    tapThere(g.game, g, LENA, { type: 'buyMule' });
    const news = g.game.viewFor(null).news.join(' | ');
    expect(news).toContain('Not enough money');
    expect(news).not.toContain('Waiting for the others');
  });

  it('AM-33 (negative): a seat leading a MULE from an empty corral is still waited for, until it installs', () => {
    const g = stagedCorral((state) => {
      state.store.mules = 1;
    });
    tapThere(g.game, g, LENA, { type: 'buyMule' });
    expect(g.game.viewFor(null).clockWaitsFor, 'Lena leads the last MULE: she can still install it; Ossa cannot get one').toEqual([LENA]);
  });
});

/** The seat's own price for its cheapest outfit, over the outfits its view's `outfitCosts` lists. */
function cheapestOutfit(state: GameState, seatId: string): number {
  return Math.min(...[...GOODS, 'greenBelt' as const].map((o) => outfitCostFor(state, seatId, o)));
}
