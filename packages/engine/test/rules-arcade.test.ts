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
  GLINT,
  installMule,
  outfitMule,
  RuleError,
  sellPelts,
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
const saved = { peltPrice: WOLVES.peltPrice, prize: GLINT.prize };
afterEach(() => {
  WOLVES.peltPrice = saved.peltPrice;
  GLINT.prize = saved.prize;
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
    expect(home.outfit).toBeNull();

    catchMule(state, 'p0');
    installMule(state, 'p0', 0, 0);
    expect(home.outfit).toBe('food');
  });

  it('RULE-4, C4: a MULE still bolted when the clock ends runs off, like any MULE not installed', () => {
    const state = developing();
    leadingFood(state);
    boltMule(state, 'p0');
    advancePhase(state);
    expect(state.phase).toBe('production');
    expect(p0(state).carriedMule).toBeNull();
    expect(p0(state).muleBolted ?? false).toBe(false);
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
