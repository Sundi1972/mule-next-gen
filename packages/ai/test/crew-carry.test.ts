import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, crewFactor, DEV_WALK, factoryFit, GOOD_CONFIG, isFactory, monthNeeds, needsOf, observe, rawOutput, RECIPES, UPKEEP, type GameState, type Good, type Outfit, type ProcessedGood, type Tile } from '@mule/engine';
import { outlook } from '../src/outlook.js';
import { AiSeat } from '../src/seat.js';
import { afterTax, foodUnits, installGain, keptUnits, monthlyNet, monthWalkSeconds, secondValue, unitValues, wholeNextMonth } from '../src/value.js';

/**
 * PR-8 (needs C14): a player's plots, but its Energy plants, make crewFactor of their output in the production after a
 * month end its crews went short at. The seat values a MULE it installs before that production at the cut output for
 * its first month, and in full after: by the next month end it can have fed its crews.
 */
const ME = 'ai0';
const flat = { food: 3, water: 0, energy: 3, smithore: 0, crystite: 0, rareEarth: 0 };

/** Month 2's development: ai0 owns idle plains at x 0 and 1, with cash and a full larder; its crews went `short`. */
function development(short: { food: number; water: number } | undefined): GameState {
  const state = createGame({ seed: 7, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true })) });
  while (state.phase !== 'development' || state.month < 2) advancePhase(state);
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  for (const x of [0, 1]) {
    const tile = state.tiles[x]!;
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flat }, owner: ME, outfit: null, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
  }
  const me = state.players.find((p) => p.id === ME)!;
  Object.assign(me.stock, { food: 30, water: 30, energy: 30 });
  me.money = 8_000;
  if (short) me.crewShort = short;
  else delete me.crewShort;
  return state;
}

const mind = () => new AiSeat({ id: ME, name: ME, persona: 'trader', level: 'trader', seed: 11 }).mind;

describe('PR-8 (needs C14): a seat whose crews went short values its next production at the crew factor', () => {
  const SHORT = { food: 1, water: 0 };

  it("the first month of a farm counts crewFactor of its output, rounded as the engine rounds; the months after count it in full", () => {
    const m = mind();
    const fedObs = observe(development(undefined), ME);
    const shortObs = observe(development(SHORT), ME);
    expect(shortObs.players.find((p) => p.id === ME)!.crewShort, 'the case: the seat sees its own crews went short').toEqual(SHORT);
    const f = crewFactor(SHORT);
    expect(f, 'the case: the cut bites').toBeLessThan(1);
    // One outlook for both, so only the crews differ.
    const o = outlook(fedObs, ME, { lookAhead: m.level.lookAhead });
    const tile = (obs: GameState) => obs.tiles[0]!;
    const fed = installGain(fedObs, o, tile(fedObs), 'food', m);
    const short = installGain(shortObs, o, tile(shortObs), 'food', m);
    expect(fed.y.made, 'the case: the farm makes something').toBeGreaterThan(0);
    expect(short.y.made, 'the long-run yield is the fed one').toBe(fed.y.made);
    const first = monthlyNet(shortObs, o, { ...fed.y, made: Math.round(fed.y.made * f) }, 'food', m);
    expect(short.gain).toBeCloseTo(fed.gain - fed.net + first, 6);
    expect(short.gain).toBeLessThan(fed.gain);
  });

  it('negative: an Energy plant is not cut; nor is anything once the month has produced', () => {
    const m = mind();
    const fedObs = observe(development(undefined), ME);
    const shortObs = observe(development(SHORT), ME);
    const o = outlook(fedObs, ME, { lookAhead: m.level.lookAhead });
    const gain = (obs: GameState, outfit: Outfit) => installGain(obs, o, obs.tiles[1]!, outfit, m).gain;
    expect(gain(shortObs, 'energy')).toBeCloseTo(gain(fedObs, 'energy'), 6);
    const after = (short: typeof SHORT | undefined) => {
      const state = development(short);
      state.phase = 'auction';
      return observe(state, ME);
    };
    expect(gain(after(SHORT), 'food')).toBeCloseTo(gain(after(undefined), 'food'), 6);
  });
});

describe("PR-8 (needs C15, PM ruling 8 Nov): no Food carry; the household's Food keeps off hunger, the crews' keeps their output", () => {
  /** Month 2's development, fed: ai0 runs a farm on x 0 and a Smithore mine on x 1, so it has crews to feed. */
  function running(): GameState {
    const state = development(undefined);
    state.tiles[0]!.outfit = 'food';
    state.tiles[1]!.outfit = 'smithore';
    return state;
  }

  it('wholeNextMonth holds the Food upkeep eats, no more; Water and Energy keep their carry', () => {
    const obs = observe(running(), ME);
    expect(wholeNextMonth(obs, ME, 'food')).toBe(needsOf(obs, ME).food);
    // Negative: next production draws on carried Water and Energy (AM-17, AM-18), so they still carry.
    expect(wholeNextMonth(obs, ME, 'energy')).toBeGreaterThan(0);
    expect(wholeNextMonth(obs, ME, 'water')).toBe(needsOf(obs, ME).water + keptUnits('water', monthNeeds(obs, ME).water));
  });

  it("the Food block: the household's units first, each its share of the hunger they keep off; then the crews', each its share of crewDrop of the plots' output", () => {
    const m = mind();
    const obs = observe(running(), ME);
    const o = outlook(obs, ME, { lookAhead: m.level.lookAhead });
    const P = (g: Good) => o.price(g);
    const eat = needsOf(obs, ME).food;
    const crews = eat - UPKEEP.baseFood;
    expect(crews, 'the case: the crews eat').toBeGreaterThan(0);
    const hunger = (monthWalkSeconds(obs, m) * (1 / DEV_WALK.hungerPaceMin - 1) * secondValue(obs, ME)) / UPKEEP.baseFood;
    const made = (t: Tile) => (isFactory(t.outfit!) ? factoryFit(obs, t, t.outfit as ProcessedGood, ME).output : rawOutput(obs, t));
    const output = obs.tiles.filter((t) => t.owner === ME && t.outfit).reduce((n, t) => n + afterTax(obs, made(t) * P(t.outfit as Good)), 0);
    const units = foodUnits(obs, m, P);
    expect(units).toHaveLength(eat);
    units.forEach((x, k) => expect(x, `unit ${k}`).toBeCloseTo(k < UPKEEP.baseFood ? hunger : (UPKEEP.crewDrop * output) / crews, 6));
    expect(unitValues(obs, o, 'food', m).block, 'the block is what upkeep eats').toBe(eat);
  });
});

describe("PR-8 (needs C15): a factory's Food units are worth the factory's run, not the household's meal", () => {
  it("with a Medicine works, the Food it turns is valued at its share of the works' output, unit by unit", () => {
    const m = mind();
    const state = development(undefined);
    state.tiles[0]!.outfit = 'medicine';
    const obs = observe(state, ME);
    const o = outlook(obs, ME, { lookAhead: m.level.lookAhead });
    const works = obs.tiles[0]!;
    const q = RECIPES.medicine.inputs.food ?? 0;
    expect(q, 'the case: the works turns Food').toBeGreaterThan(0);
    const inputs = Object.values(RECIPES.medicine.inputs).reduce((n, x) => n + (x ?? 0), 0);
    const each = afterTax(obs, factoryFit(obs, works, 'medicine', ME).output * o.price('medicine')) / inputs;
    const add = Math.ceil(q / (1 - GOOD_CONFIG.food.spoilage));
    const v = unitValues(obs, o, 'food', m);
    expect(v.block, "the block: the meal, then the works' Food").toBe(needsOf(obs, ME).food + add);
    const near = v.buy.filter((x) => Math.abs(x - each) < 1e-6).length;
    expect(near, "the works' units each buy at the works' share").toBeGreaterThanOrEqual(add);
  });
});
