import { analysisSeconds, DEVELOPMENT, RuleError, SPECIES_PERK, tileIndex, walkSeconds, type GameState, type Outfit } from '@mule/engine';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { seats, toDevelopment, walkers } from './fake-context.js';

const LENA = 's1';
const OSSA = 's2';

type Plot = { x: number; y: number; index: number };

/** Real ms that `seconds` of development last at a phaseScale: the server keeps whole ms, like phaseEndsAt. */
const msOf = (seconds: number, scale = 1) => Math.round(seconds * 1_000 * scale);

/** A free plot exactly `steps` grid steps from the store, so a walk there has a length worth measuring. */
function plotAway(state: GameState, steps: number): Plot {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const t = state.tiles.find((t) => t.terrain !== 'store' && t.owner === null && Math.abs(t.x - store.x) + Math.abs(t.y - store.y) === steps);
  if (!t) throw new Error(`no free plot ${steps} steps from the store`);
  return { x: t.x, y: t.y, index: tileIndex(state.width, t.x, t.y) };
}

const xy = ({ x, y }: Plot) => ({ x, y });
const colonistOf = (view: MuleView, id: string) => view.players.find((p) => p.id === id)!.colonist;
const moneyOf = (view: MuleView, id: string) => view.players.find((p) => p.id === id)!.money;

/** The walk a seat's colonist is on, as every screen sees it; fails the test when it isn't walking. */
function walkOf(view: MuleView, id: string) {
  const walk = colonistOf(view, id)?.walk;
  expect(walk, `${id} is walking`).toBeTruthy();
  return walk!;
}

/**
 * Development with Lena (Zipwing) and Ossa (Mollox), both fed and holding Medicine, so neither walks slower for hunger
 * or sickness. Lena owns `home`, 3 steps from the store; `far`, 4 steps out, is free.
 */
function walking(phaseScale?: number) {
  let home: Plot | null = null;
  let far: Plot | null = null;
  const g = toDevelopment({
    players: walkers,
    phaseScale,
    prepare: (state) => {
      for (const p of state.players) Object.assign(p.stock, { food: 20, medicine: 2 });
      home = plotAway(state, 3);
      state.tiles[home.index]!.owner = LENA;
      far = plotAway(state, 4);
    },
  });
  const start = g.ctx.now();
  const advanceTo = (at: number) => g.advance(at - g.ctx.now());
  return { ...g, start, home: home!, far: far!, advanceTo };
}

/** At phaseScale 1, Lena buys a MULE at the corral and outfits it, waiting out her walk there. */
function leadOutfitted(w: ReturnType<typeof walking>, outfit: Outfit = 'food') {
  w.game.handle(LENA, { type: 'buyMule' });
  w.advance(msOf(walkSeconds(w.state, LENA, 'store', 'corral')));
  w.game.handle(LENA, { type: 'outfit', outfit });
  expect(w.game.viewFor(LENA).me!.carriedMule).toBe(outfit);
}

describe('T-AC-7: colonists walk at their own pace, and the action applies on arrival', () => {
  it("T-AC-7: a Zipwing and a Mollox analyse the same plot from the store; each arrives at its walkSeconds, the Zipwing in 1 / zipwingSpeed of the Mollox's time, and the ground shows only on arrival", () => {
    const { game, state, ctx, advanceTo, far } = walking();
    const t0 = ctx.now();
    game.handle(LENA, { type: 'analyse', ...xy(far) });
    game.handle(OSSA, { type: 'analyse', ...xy(far) });

    const tv = game.viewFor(null);
    for (const id of [LENA, OSSA]) expect(colonistOf(tv, id), id).toMatchObject({ at: far.index, walk: { from: 'store', startedAt: t0 }, assayUntil: null });
    const lena = walkOf(tv, LENA);
    const lenaMs = lena.arrivesAt - t0;
    const ossaMs = walkOf(tv, OSSA).arrivesAt - t0;
    expect(lenaMs).toBe(msOf(walkSeconds(state, LENA, 'store', far.index)));
    expect(ossaMs).toBe(msOf(walkSeconds(state, OSSA, 'store', far.index)));
    expect(lenaMs / ossaMs).toBeCloseTo(1 / SPECIES_PERK.zipwingSpeed, 2);

    advanceTo(lena.arrivesAt - 1);
    expect(game.viewFor(LENA).tiles[far.index]!.ground).toBeUndefined();
    advanceTo(lena.arrivesAt);
    expect(game.viewFor(LENA).tiles[far.index]!.ground).toBeDefined();
    expect(game.viewFor(OSSA).tiles[far.index]!.ground, "Ossa's slower walk is still under way").toBeUndefined();
    expect(colonistOf(game.viewFor(OSSA), LENA)).toEqual({ at: far.index, walk: null, assayUntil: lena.arrivesAt + msOf(analysisSeconds(state, LENA)) });
  });

  it('T-AC-7: an install applies only on arrival: a ms before, her plot carries no MULE; on arrival it carries hers', () => {
    const w = walking();
    const { game, state, ctx, advanceTo, home } = w;
    leadOutfitted(w);
    const t = ctx.now();
    game.handle(LENA, { type: 'install', ...xy(home) });
    const walk = walkOf(game.viewFor(null), LENA);
    expect(walk).toEqual({ from: 'corral', startedAt: t, arrivesAt: t + msOf(walkSeconds(state, LENA, 'corral', home.index)) });

    advanceTo(walk.arrivesAt - 1);
    expect(game.viewFor(null).tiles[home.index]!.outfit).toBeNull();
    expect(game.viewFor(LENA).me!.carriedMule).toBe('food');
    advanceTo(walk.arrivesAt);
    expect(game.viewFor(null).tiles[home.index]).toMatchObject({ owner: LENA, outfit: 'food' });
    expect(game.viewFor(LENA).me!.carriedMule).toBeNull();
  });

  it("T-AC-7 (negative): a walk off the map, or one that would arrive after the clock's end, is refused and changes nothing; so is one started after the clock ran out", () => {
    const { game, state, advanceTo, far } = walking();
    const offMap = [
      { x: -1, y: 0 },
      { x: state.width, y: 0 },
      { x: 0, y: state.height },
    ];
    for (const type of ['install', 'analyse', 'filter'] as const) {
      for (const spot of offMap) {
        const tv = game.viewFor(null);
        const mine = game.viewFor(LENA);
        expect(() => game.handle(LENA, { type, ...spot }), `${type} at ${spot.x},${spot.y}`).toThrow(RuleError);
        expect(game.viewFor(null)).toEqual(tv);
        expect(game.viewFor(LENA)).toEqual(mine);
      }
    }
    const end = game.viewFor(LENA).me!.devEndsAt!;
    advanceTo(end - msOf(walkSeconds(state, LENA, 'store', far.index)) + 1);
    const tv = game.viewFor(null);
    const mine = game.viewFor(LENA);
    expect(() => game.handle(LENA, { type: 'analyse', ...xy(far) })).toThrow(/time/i);
    expect(game.viewFor(null)).toEqual(tv);
    expect(game.viewFor(LENA)).toEqual(mine);
    expect(colonistOf(tv, LENA)).toEqual({ at: 'store', walk: null, assayUntil: null });

    advanceTo(end);
    const after = game.viewFor(LENA);
    expect(() => game.handle(LENA, { type: 'analyse', ...xy(far) })).toThrow();
    expect(game.viewFor(LENA)).toEqual(after);
  });
});

describe('B-AC-11: Lena walks to the corral on the one clock (the server half)', () => {
  it('B-AC-11: Lena taps the corral and walks there; the MULE is hers only on arrival, walkSeconds later, while the clock runs on, and every other phone and the TV show her walking', () => {
    const { game, state, ctx, advanceTo } = walking();
    const t0 = ctx.now();
    const end = game.viewFor(LENA).me!.devEndsAt!;
    const money = moneyOf(game.viewFor(null), LENA);
    const price = game.viewFor(LENA).me!.mulePrice;
    const mules = game.viewFor(null).storeMules;
    game.handle(LENA, { type: 'buyMule' });

    const arrivesAt = t0 + msOf(walkSeconds(state, LENA, 'store', 'corral'));
    for (const viewer of [OSSA, null]) {
      expect(colonistOf(game.viewFor(viewer), LENA), `seen by ${viewer ?? 'the TV'}`).toEqual({ at: 'corral', walk: { from: 'store', startedAt: t0, arrivesAt }, assayUntil: null });
    }
    advanceTo(arrivesAt - 1);
    expect(game.viewFor(LENA).me!.carriedMule).toBeNull();
    expect(moneyOf(game.viewFor(null), LENA)).toBe(money);
    expect(game.viewFor(null).storeMules).toBe(mules);

    advanceTo(arrivesAt);
    expect(game.viewFor(LENA).me!.carriedMule).toBe('empty');
    expect(moneyOf(game.viewFor(null), LENA)).toBe(money - price);
    expect(game.viewFor(null).storeMules).toBe(mules - 1);
    expect(colonistOf(game.viewFor(OSSA), LENA)).toEqual({ at: 'corral', walk: null, assayUntil: null });
    expect(game.viewFor(LENA).me!.devEndsAt, 'the walk ran on the one clock; it never shortened it').toBe(end);
  });

  it('B-AC-11 (negative): while Lena walks, every tap is refused "Still walking" and changes nothing', () => {
    const { game, home, far } = walking();
    game.handle(LENA, { type: 'buyMule' });
    const tv = game.viewFor(null);
    const mine = game.viewFor(LENA);
    const taps: MuleIntent[] = [
      { type: 'buyMule' },
      { type: 'outfit', outfit: 'food' },
      { type: 'install', ...xy(home) },
      { type: 'analyse', ...xy(far) },
      { type: 'filter', ...xy(home) },
      { type: 'pub' },
    ];
    for (const tap of taps) expect(() => game.handle(LENA, tap), tap.type).toThrow('Still walking');
    expect(game.viewFor(null)).toEqual(tv);
    expect(game.viewFor(LENA)).toEqual(mine);
  });
});

describe('FM-corral-race: two colonists head for the corral with one MULE left', () => {
  it('FM-corral-race: the earlier arrival gets the MULE although it is the higher seat and the slower walker; the other keeps its money and the news says so', () => {
    const { game, state, advanceTo } = walking();
    state.store.mules = 1;
    const money = moneyOf(game.viewFor(null), LENA);
    game.handle(OSSA, { type: 'buyMule' });
    const ossaArrives = walkOf(game.viewFor(null), OSSA).arrivesAt;
    // Lena, the faster walker and the lower seat, sets off so that she arrives one ms after Ossa.
    advanceTo(ossaArrives - msOf(walkSeconds(state, LENA, 'store', 'corral')) + 1);
    expect(() => game.handle(LENA, { type: 'buyMule' })).not.toThrow();
    expect(walkOf(game.viewFor(null), LENA).arrivesAt).toBe(ossaArrives + 1);

    advanceTo(ossaArrives + 1);
    expect(game.viewFor(OSSA).me!.carriedMule).toBe('empty');
    expect(game.viewFor(LENA).me!.carriedMule).toBeNull();
    expect(moneyOf(game.viewFor(null), LENA)).toBe(money);
    expect(game.viewFor(null).storeMules).toBe(0);
    expect(game.viewFor(null).news[0]).toMatch(/Lena.*out of MULEs/);
  });

  it('FM-corral-race: arriving in the same ms, the lower seat gets the MULE, though it tapped last', () => {
    const { game, state, advanceTo } = walking();
    state.store.mules = 1;
    const money = moneyOf(game.viewFor(null), OSSA);
    game.handle(OSSA, { type: 'buyMule' });
    const ossaArrives = walkOf(game.viewFor(null), OSSA).arrivesAt;
    advanceTo(ossaArrives - msOf(walkSeconds(state, LENA, 'store', 'corral')));
    game.handle(LENA, { type: 'buyMule' });
    expect(walkOf(game.viewFor(null), LENA).arrivesAt).toBe(ossaArrives);

    advanceTo(ossaArrives);
    expect(game.viewFor(LENA).me!.carriedMule).toBe('empty');
    expect(game.viewFor(OSSA).me!.carriedMule).toBeNull();
    expect(moneyOf(game.viewFor(null), OSSA)).toBe(money);
    expect(game.viewFor(null).news[0]).toMatch(/Ossa.*out of MULEs/);
  });
});

describe('FM-one-clock: one development clock for every seat', () => {
  it.each([1, 0.1])("FM-one-clock: at phaseScale %s every seat's devEndsAt, the AI's too, is development's start + fullSeconds × 1_000 × phaseScale; the phase ends there, with no grace", (scale) => {
    const { game, ctx, advance } = toDevelopment({ phaseScale: scale });
    const end = ctx.now() + DEVELOPMENT.fullSeconds * 1_000 * scale;
    for (const { id } of seats) expect(game.viewFor(id).me!.devEndsAt, id).toBe(end);
    expect(game.viewFor(null).phaseEndsAt).toBe(end);
    advance(end - 1 - ctx.now());
    expect(game.viewFor(null).phase).toBe('development');
    advance(1);
    expect(game.viewFor(null).phase).toBe('production');
  });

  it("FM-one-clock: the pub ends only its own seat's turn; the phase ends early once every seat is at the pub or away", () => {
    const { game, start } = walking();
    const end = start + DEVELOPMENT.fullSeconds * 1_000;
    game.handle(LENA, { type: 'pub' });
    expect(game.viewFor(null).phase).toBe('development');
    expect(game.viewFor(null).players.find((p) => p.id === LENA)!.doneDeveloping).toBe(true);
    expect(() => game.handle(LENA, { type: 'buyMule' })).toThrow('pub');
    expect(game.viewFor(OSSA).me!.devEndsAt).toBe(end);
    expect(game.viewFor(LENA).me!.devEndsAt).toBe(end);
    expect(() => game.handle(OSSA, { type: 'buyMule' })).not.toThrow();
    game.connectionChanged(OSSA, false);
    expect(game.viewFor(null).phase).toBe('production');
  });
});

describe('FM-scaled-clock: development time is game seconds at any phaseScale', () => {
  it.each([1, 0.1])('FM-scaled-clock: at phaseScale %s an assay keeps the colonist busy analysisSeconds × 1_000 × phaseScale, and never shortens the clock', (scale) => {
    const { game, state, ctx, advance, far, start } = walking(scale);
    game.handle(LENA, { type: 'analyse', ...xy(far) });
    advance(msOf(walkSeconds(state, LENA, 'store', far.index) + analysisSeconds(state, LENA), scale));
    // Standing on the plot now, so the next assay starts at the tap.
    game.handle(LENA, { type: 'analyse', ...xy(far) });
    advance(msOf(DEVELOPMENT.analysisSeconds, scale) - 1);
    expect(() => game.handle(LENA, { type: 'analyse', ...xy(far) })).toThrow('Still assaying');
    advance(1);
    expect(() => game.handle(LENA, { type: 'analyse', ...xy(far) })).not.toThrow();
    expect(ctx.now()).toBeLessThan(game.viewFor(LENA).me!.devEndsAt!);
    expect(game.viewFor(LENA).me!.devEndsAt).toBe(start + DEVELOPMENT.fullSeconds * 1_000 * scale);
  });

  it("FM-scaled-clock: a pub at the clock's halfway point pays for half the time left, the same at phaseScale 1 and 0.1", () => {
    const paid = [1, 0.1].map((scale) => {
      const { game, ctx, advanceTo, start } = walking(scale);
      advanceTo(start + (game.viewFor(LENA).me!.devEndsAt! - start) / 2);
      const money = moneyOf(game.viewFor(null), LENA);
      game.handle(LENA, { type: 'pub' });
      expect(ctx.now()).toBe(start + DEVELOPMENT.fullSeconds * 500 * scale);
      return moneyOf(game.viewFor(null), LENA) - money;
    });
    const { base, start, perMonth } = DEVELOPMENT.pub;
    const half = Math.round(base + (start + perMonth) * 0.5);
    expect(paid).toEqual([half, half]);
  });
});

describe('FM-pub-late: the pub pays for the time left when the colonist gets there', () => {
  it("FM-pub-late: a pub tap with less time left than its walk is accepted, and a colonist still walking there at the clock's end is paid with 0 left", () => {
    const { game, state, advanceTo, far } = walking();
    game.handle(LENA, { type: 'analyse', ...xy(far) });
    const end = game.viewFor(LENA).me!.devEndsAt!;
    advanceTo(end - msOf(walkSeconds(state, LENA, far.index, 'store')) + 1);
    expect(colonistOf(game.viewFor(null), LENA)).toEqual({ at: far.index, walk: null, assayUntil: null });
    const money = moneyOf(game.viewFor(null), LENA);
    expect(() => game.handle(LENA, { type: 'pub' })).not.toThrow();
    expect(walkOf(game.viewFor(null), LENA).arrivesAt).toBeGreaterThan(end);

    advanceTo(end);
    expect(game.viewFor(null).phase).toBe('production');
    expect(moneyOf(game.viewFor(null), LENA) - money).toBe(DEVELOPMENT.pub.base);
  });

  it('FM-pub-late: a pub walk that arrives in time pays for the game seconds left at its arrival, not at the tap', () => {
    const { game, state, advanceTo, far } = walking();
    game.handle(LENA, { type: 'analyse', ...xy(far) });
    const end = game.viewFor(LENA).me!.devEndsAt!;
    const halfway = end - msOf(DEVELOPMENT.fullSeconds / 2);
    advanceTo(halfway - msOf(walkSeconds(state, LENA, far.index, 'store')));
    const money = moneyOf(game.viewFor(null), LENA);
    game.handle(LENA, { type: 'pub' });
    expect(walkOf(game.viewFor(null), LENA)).toMatchObject({ from: far.index, arrivesAt: halfway });
    advanceTo(halfway - 1);
    expect(moneyOf(game.viewFor(null), LENA)).toBe(money);
    advanceTo(halfway);
    const { base, start, perMonth } = DEVELOPMENT.pub;
    expect(moneyOf(game.viewFor(null), LENA) - money).toBe(Math.round(base + (start + perMonth) * 0.5));
    expect(game.viewFor(null).players.find((p) => p.id === LENA)!.doneDeveloping).toBe(true);
  });

  it("FM-pub-late: an install whose walk ends exactly at the clock's end still applies", () => {
    const w = walking();
    const { game, state, advanceTo, home } = w;
    leadOutfitted(w);
    const end = game.viewFor(LENA).me!.devEndsAt!;
    advanceTo(end - msOf(walkSeconds(state, LENA, 'corral', home.index)));
    game.handle(LENA, { type: 'install', ...xy(home) });
    expect(walkOf(game.viewFor(null), LENA).arrivesAt).toBe(end);

    advanceTo(end);
    const after = game.viewFor(null);
    expect(after.phase).toBe('production');
    expect(after.tiles[home.index]).toMatchObject({ owner: LENA, outfit: 'food' });
  });
});

describe('FM-ai-still-walking: AI seats walk too', () => {
  it('FM-ai-still-walking: at phaseScale 1 an AI seat buys, outfits and installs a MULE without one "Still walking" or "Still assaying" refusal, and each install lands on its arrival', () => {
    const AI = 's3';
    const { game, ctx, advance } = toDevelopment();
    const refused: string[] = [];
    const handle = game.handle.bind(game);
    game.handle = (seatId, intent) => {
      try {
        handle(seatId, intent);
      } catch (err) {
        if (seatId === AI) refused.push(`${intent.type}: ${(err as Error).message}`);
        throw err;
      }
    };
    for (const id of ['s1', 's2']) game.handle(id, { type: 'pub' });

    const installs: { good: Outfit; before: Outfit | null; after: Outfit | null }[] = [];
    while (game.viewFor(null).phase === 'development') {
      const colonist = colonistOf(game.viewFor(null), AI);
      const good = game.viewFor(AI).me!.carriedMule;
      if (colonist?.walk && typeof colonist.at === 'number' && good && good !== 'empty') {
        advance(colonist.walk.arrivesAt - 1 - ctx.now());
        const before = game.viewFor(null).tiles[colonist.at]!.outfit;
        advance(1);
        installs.push({ good, before, after: game.viewFor(null).tiles[colonist.at]!.outfit });
      }
      advance(100);
    }
    expect(refused.filter((r) => r.includes('Still'))).toEqual([]);
    expect(installs.length).toBeGreaterThan(0);
    for (const i of installs) expect(i).toEqual({ good: i.good, before: null, after: i.good });
  });
});
