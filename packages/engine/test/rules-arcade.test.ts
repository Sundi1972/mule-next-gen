/**
 * The arcade's rules in game.ts (arcade spec C4, AM-2): what the development moments pay, the bolted MULE, and taking a
 * MULE off a plot to re-outfit it. The floor (WS1's) calls these; here they are pressed directly, as game rules.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  awardGlint,
  boltMule,
  buyMule,
  catchMule,
  createGame,
  DEV_STEER,
  GLINT,
  installMule,
  outfitCostFor,
  outfitMule,
  reoutfitCostFor,
  reoutfitMule,
  RuleError,
  sellPelts,
  takeMule,
  visitPub,
  WOLVES,
  type GameState,
  type Species,
  type Tile,
} from '../src/index.js';

const flatGround = { food: 2, water: 2, energy: 2, smithore: 0, crystite: 0, rareEarth: 0 };

function newGame(species: Species[] = ['zipwing', 'bramblet', 'gearling', 'mollox']): GameState {
  return createGame({ seed: 42, players: species.map((s, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species: s })) });
}

function plot(state: GameState, x: number, y: number, owner: string | null, outfit: Tile['outfit'] = null): Tile {
  const tile = state.tiles[y * state.width + x]!;
  Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround }, owner, outfit, pollution: 0, filter: false, runMonths: 0 });
  return tile;
}

function toPhase(state: GameState, phase: GameState['phase']): void {
  while (state.phase !== phase) advancePhase(state);
}

/** A game in development with plenty of money all round. */
function developing(): GameState {
  const state = newGame();
  toPhase(state, 'development');
  for (const p of state.players) p.money = 2_000;
  return state;
}

/** p0 leads a Food MULE, bought and outfitted at the store. */
function leadingFood(state: GameState): void {
  buyMule(state, 'p0');
  outfitMule(state, 'p0', 'food');
}

const p0 = (state: GameState) => state.players[0]!;

// Config the tests move, put back after each.
const saved = { peltPrice: WOLVES.peltPrice, prize: GLINT.prize, reoutfitCost: DEV_STEER.reoutfitCost, steerOn: DEV_STEER.on };
afterEach(() => {
  WOLVES.peltPrice = saved.peltPrice;
  GLINT.prize = saved.prize;
  DEV_STEER.reoutfitCost = saved.reoutfitCost;
  DEV_STEER.on = saved.steerOn;
});

describe('C4: the moments pay out in the rules', () => {
  it('RULE-3 row 6, C4: pelts sold at the store pay n × WOLVES.peltPrice, from the store', () => {
    const state = developing();
    const { money } = p0(state);
    const capital = state.store.capital;
    expect(sellPelts(state, 'p0', 2)).toBe(2 * WOLVES.peltPrice);
    expect(p0(state).money).toBe(money + 2 * WOLVES.peltPrice);
    expect(state.store.capital).toBe(capital - 2 * WOLVES.peltPrice);
  });

  it('C4, HC-2: the pelt price is read live from config, so sim --set reaches it', () => {
    const state = developing();
    const { money } = p0(state);
    WOLVES.peltPrice = 35;
    sellPelts(state, 'p0', 3);
    expect(p0(state).money).toBe(money + 105);
  });

  it("RULE-5, C4: the glint's prize is GLINT.crystite Crystite into stock when GLINT.prize is 'crystite'", () => {
    const state = developing();
    const { money } = p0(state);
    const crystite = p0(state).stock.crystite;
    expect(awardGlint(state, 'p0')).toEqual({ prize: 'crystite', amount: GLINT.crystite });
    expect(p0(state).stock.crystite).toBe(crystite + GLINT.crystite);
    expect(p0(state).money).toBe(money);
  });

  it("RULE-5, C4: the glint's prize is GLINT.credits in money when GLINT.prize is 'credits'", () => {
    const state = developing();
    GLINT.prize = 'credits';
    const { money } = p0(state);
    const crystite = p0(state).stock.crystite;
    expect(awardGlint(state, 'p0')).toEqual({ prize: 'credits', amount: GLINT.credits });
    expect(p0(state).money).toBe(money + GLINT.credits);
    expect(p0(state).stock.crystite).toBe(crystite);
  });

  it('RULE-4, C4: a bolted MULE is still yours but leads again only once caught', () => {
    const state = developing();
    const home = plot(state, 0, 0, 'p0');
    leadingFood(state);
    boltMule(state, 'p0');
    expect(p0(state).carriedMule).toBe('food');
    expect(() => installMule(state, 'p0', 0, 0)).toThrow(RuleError);
    expect(() => buyMule(state, 'p0')).toThrow(RuleError);
    expect(() => outfitMule(state, 'p0', 'water')).toThrow(RuleError);
    expect(() => reoutfitMule(state, 'p0', 'water')).toThrow(RuleError);
    expect(home.outfit).toBeNull();

    catchMule(state, 'p0');
    installMule(state, 'p0', 0, 0);
    expect(home.outfit).toBe('food');
  });

  it('AM-14, RULE-4, C4: a bought MULE that bolts and is never caught is lost to the clock, like any MULE not installed', () => {
    const state = developing();
    const home = plot(state, 0, 0, 'p0');
    const mules = state.store.mules;
    leadingFood(state);
    boltMule(state, 'p0');
    advancePhase(state);
    expect(state.phase).toBe('production');
    expect(p0(state).carriedMule).toBeNull();
    expect(p0(state).muleBolted ?? false).toBe(false);
    expect(home.outfit).toBeNull();
    expect(state.store.mules).toBe(mules - 1);
  });

  it('HC-7: a refused moment throws RuleError and changes nothing', () => {
    const state = developing();
    const before = structuredClone(state);
    expect(() => sellPelts(state, 'p0', 0)).toThrow(RuleError);
    expect(() => sellPelts(state, 'p0', -1)).toThrow(RuleError);
    expect(() => sellPelts(state, 'p0', 1.5)).toThrow(RuleError);
    expect(() => boltMule(state, 'p0')).toThrow(RuleError); // no MULE to bolt
    expect(() => catchMule(state, 'p0')).toThrow(RuleError); // none bolted
    expect(() => sellPelts(state, 'nobody', 1)).toThrow(RuleError);
    expect(state).toEqual(before);

    leadingFood(state);
    boltMule(state, 'p0');
    expect(() => boltMule(state, 'p0')).toThrow(RuleError); // already bolted
  });

  it('HC-7: the moments pay nobody outside development or after the pub', () => {
    const planning = newGame();
    expect(() => sellPelts(planning, 'p0', 1)).toThrow(RuleError);
    expect(() => awardGlint(planning, 'p0')).toThrow(RuleError);

    const state = developing();
    visitPub(state, 'p0', 10);
    expect(() => sellPelts(state, 'p0', 1)).toThrow(RuleError);
    expect(() => awardGlint(state, 'p0')).toThrow(RuleError);
    expect(() => catchMule(state, 'p0')).toThrow(RuleError);
  });
});

describe('AM-2: take a MULE off a plot and re-outfit it at the store', () => {
  it('AM-2, RULE-3 row 11a: TAKE leads the plot’s MULE away, and the plot makes nothing while it is gone', () => {
    const state = developing();
    const farm = plot(state, 0, 0, 'p0', 'food');
    const other = plot(state, 2, 0, 'p0');
    takeMule(state, 'p0', 0, 0);
    expect(p0(state).carriedMule).toBe('food');
    expect(farm.outfit).toBeNull();

    // Moved to another own plot unchanged (row 10): the old plot makes nothing at production, the new one makes Food.
    installMule(state, 'p0', 2, 0);
    advancePhase(state);
    expect(farm.outfit).toBeNull();
    expect(other.outfit).toBe('food');
    const twin = developing();
    plot(twin, 0, 0, 'p0');
    plot(twin, 2, 0, 'p0', 'food');
    advancePhase(twin);
    expect(state.history.at(-1)!.produced.p0).toEqual(twin.history.at(-1)!.produced.p0);
  });

  it('AM-2, HC-7: TAKE is refused off a plot not yours, a plot with no MULE, or while leading a MULE', () => {
    const state = developing();
    plot(state, 0, 0, 'p1', 'food');
    plot(state, 2, 0, 'p0');
    plot(state, 4, 0, 'p0', 'water');
    expect(() => takeMule(state, 'p0', 0, 0)).toThrow(RuleError);
    expect(() => takeMule(state, 'p0', 2, 0)).toThrow(RuleError);
    buyMule(state, 'p0');
    expect(() => takeMule(state, 'p0', 4, 0)).toThrow(RuleError);
    expect(state.tiles[4]!.outfit).toBe('water');
  });

  it('AM-2, RULE-3 row 8a: RE-OUTFIT charges DEV_STEER.reoutfitCost of the outfitter’s price, to the store', () => {
    const state = developing();
    plot(state, 0, 0, 'p0', 'food');
    takeMule(state, 'p0', 0, 0);
    const { money } = p0(state);
    const capital = state.store.capital;
    expect(reoutfitCostFor(state, 'p0', 'energy')).toBe(outfitCostFor(state, 'p0', 'energy'));
    reoutfitMule(state, 'p0', 'energy');
    expect(p0(state).carriedMule).toBe('energy');
    expect(p0(state).money).toBe(money - outfitCostFor(state, 'p0', 'energy'));
    expect(state.store.capital).toBe(capital + outfitCostFor(state, 'p0', 'energy'));
  });

  it('AM-2, HC-2: the re-outfit share is read live, and a Gearling pays its discounted outfit price', () => {
    const state = developing();
    DEV_STEER.reoutfitCost = 0.5;
    plot(state, 0, 0, 'p2', 'food'); // p2 is the Gearling
    takeMule(state, 'p2', 0, 0);
    const { money } = state.players[2]!;
    const cost = Math.round(outfitCostFor(state, 'p2', 'water') * 0.5);
    expect(reoutfitCostFor(state, 'p2', 'water')).toBe(cost);
    reoutfitMule(state, 'p2', 'water');
    expect(state.players[2]!.money).toBe(money - cost);
  });

  it('AM-2, AM-14, HC-7: re-outfitting for the same good is refused, and so is an empty MULE, a bought one, no MULE, or money short', () => {
    const state = developing();
    plot(state, 0, 0, 'p0', 'food');
    expect(() => reoutfitMule(state, 'p0', 'water')).toThrow(RuleError); // no MULE
    takeMule(state, 'p0', 0, 0);
    const before = structuredClone(state);
    expect(() => reoutfitMule(state, 'p0', 'food')).toThrow(RuleError);
    p0(state).money = reoutfitCostFor(state, 'p0', 'water') - 1;
    expect(() => reoutfitMule(state, 'p0', 'water')).toThrow(RuleError);
    p0(state).money = before.players[0]!.money;
    expect(state).toEqual(before);

    buyMule(state, 'p1');
    expect(() => reoutfitMule(state, 'p1', 'water')).toThrow(RuleError); // empty: that is OUTFIT

    // AM-14: RE-OUTFIT is for a MULE taken off a plot only. One bought and outfitted this turn is refused, money kept.
    buyMule(state, 'p3');
    outfitMule(state, 'p3', 'food');
    const bought = state.players[3]!.money;
    expect(() => reoutfitMule(state, 'p3', 'water')).toThrow(RuleError);
    expect(state.players[3]!.carriedMule).toBe('food');
    expect(state.players[3]!.money).toBe(bought);

    // With the arcade on, OUTFIT is for an empty MULE only: a fitted one is re-outfitted, at its price, never re-fitted.
    DEV_STEER.on = true;
    const unfitted = structuredClone(state);
    expect(() => outfitMule(state, 'p0', 'water')).toThrow(new RuleError('This MULE is outfitted: re-outfit it'));
    expect(() => outfitMule(state, 'p0', 'food')).toThrow(RuleError);
    expect(() => outfitMule(state, 'p3', 'water')).toThrow(RuleError); // bought and fitted this turn: refused too
    expect(state).toEqual(unfitted);
    outfitMule(state, 'p1', 'water'); // an empty MULE still outfits
    expect(state.players[1]!.carriedMule).toBe('water');
  });

  it('F1 pin: with the arcade off, OUTFIT re-fits a fitted MULE at full price, as the tap-to-walk phone does today', () => {
    const state = developing();
    DEV_STEER.on = false;
    leadingFood(state);
    const { money } = p0(state);
    outfitMule(state, 'p0', 'water');
    expect(p0(state).carriedMule).toBe('water');
    expect(p0(state).money).toBe(money - outfitCostFor(state, 'p0', 'water'));
  });

  it('AM-2, AM-14: the clock’s end returns a taken MULE to its plot with its old outfit, and the re-outfit fee stays paid', () => {
    const state = developing();
    plot(state, 0, 0, 'p0', 'food').runMonths = 3;
    const twin = structuredClone(state);
    takeMule(state, 'p0', 0, 0);
    const fee = reoutfitCostFor(state, 'p0', 'energy');
    reoutfitMule(state, 'p0', 'energy'); // re-outfitted, and still on its lead at the end
    const afterFee = p0(state).money;
    expect(afterFee).toBe(twin.players[0]!.money - fee);
    advancePhase(state);
    advancePhase(twin);
    // No refund: the return leaves the money where paying the fee put it (production pays both twins alike).
    expect(p0(state).money).toBe(twin.players[0]!.money - fee);
    expect(state.phase).toBe('production');
    expect(p0(state).carriedMule).toBeNull();
    expect(state.tiles[0]).toEqual(twin.tiles[0]);
    expect(state.tiles[0]!.outfit).toBe('food');
    expect(state.history.at(-1)!.produced.p0).toEqual(twin.history.at(-1)!.produced.p0);
    expect(p0(state).takenMule ?? null).toBeNull();
  });

  it('AM-14, RULE-4: a taken MULE that bolts and is never caught goes home at the clock’s end', () => {
    const state = developing();
    plot(state, 0, 0, 'p0', 'food').runMonths = 3;
    const twin = structuredClone(state);
    takeMule(state, 'p0', 0, 0);
    boltMule(state, 'p0');
    advancePhase(state);
    advancePhase(twin);
    expect(state.tiles[0]).toEqual(twin.tiles[0]);
    expect(state.tiles[0]!.outfit).toBe('food');
    expect(p0(state).carriedMule).toBeNull();
    expect(p0(state).muleBolted ?? false).toBe(false);
    expect(p0(state).takenMule ?? null).toBeNull();
  });

  it('AM-2: going to the pub ends the turn too, so a taken MULE goes back to its plot', () => {
    const state = developing();
    const farm = plot(state, 0, 0, 'p0', 'food');
    farm.runMonths = 2;
    takeMule(state, 'p0', 0, 0);
    visitPub(state, 'p0', 10);
    expect(farm.outfit).toBe('food');
    expect(farm.runMonths).toBe(2);
    expect(p0(state).carriedMule).toBeNull();
  });

  it('AM-2: put back on its own plot unchanged, a taken MULE keeps the plot’s run, by any route that turn', () => {
    const state = developing();
    const farm = plot(state, 0, 0, 'p0', 'food');
    farm.runMonths = 4;
    takeMule(state, 'p0', 0, 0);
    installMule(state, 'p0', 0, 0);
    expect(farm.outfit).toBe('food');
    expect(farm.runMonths).toBe(4);
    expect(p0(state).takenMule ?? null).toBeNull();

    // F3, the hop: A to an empty own plot B, B back to A. The run is A's, so a hop can't wipe a thin vein's decline.
    const hop = plot(state, 2, 0, 'p0');
    takeMule(state, 'p0', 0, 0);
    installMule(state, 'p0', 2, 0);
    expect(hop.runMonths).toBe(0);
    takeMule(state, 'p0', 2, 0);
    installMule(state, 'p0', 0, 0);
    expect(farm.outfit).toBe('food');
    expect(farm.runMonths).toBe(4);
    expect(hop.outfit).toBeNull();
  });
});
