import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, crewFactor, observe, type GameState, type Outfit, type Tile } from '@mule/engine';
import { outlook } from '../src/outlook.js';
import { AiSeat } from '../src/seat.js';
import { installGain, monthlyNet } from '../src/value.js';

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
