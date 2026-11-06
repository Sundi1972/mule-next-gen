import { describe, expect, it } from 'vitest';
import { advancePhase, AI_PLANS, createGame, type GameState, type Outfit, type Stock, type Tile } from '@mule/engine';
import { applyAction } from '../src/play.js';
import { AiSeat, type AiSeatOptions } from '../src/seat.js';

/** A seat whose Electronics fetch a high price builds the chain to them, upstream first. See AM-32. */

const ME = 'ai0';
const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };
const WORKS: Outfit[] = ['alloy', 'electronics'];

/** Development in month 1: ai0 holds the given plots on row 0, analysed, with cash and a full larder; the others hold nothing. */
function development(plots: { x: number; outfit?: Outfit; ground?: Partial<typeof flatGround> }[], electronics: number): GameState {
  const state = createGame({ seed: 7, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  const me = state.players.find((p) => p.id === ME)!;
  for (const plot of plots) {
    const tile = state.tiles[plot.x]!;
    Object.assign(tile, { terrain: 'plains', traits: [], ground: { ...flatGround, ...plot.ground }, owner: ME, outfit: plot.outfit ?? null, pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
    delete tile.special;
    me.analysed.push(plot.x);
  }
  for (const p of state.players) {
    for (const k of Object.keys(p.stock) as (keyof Stock)[]) p.stock[k] = 0;
    p.money = 0;
  }
  Object.assign(me.stock, { food: 30, water: 30, energy: 30 });
  me.money = 8_000;
  state.store.offWorld.electronics = electronics;
  state.store.posted.electronics = electronics;
  return state;
}

/** ai0's development phase played on today's path, alone: the outfits it installed, in order. */
function playDevelopment(state: GameState, seat: AiSeat): Outfit[] {
  const before = state.tiles.map((t) => t.outfit);
  const installed: Outfit[] = [];
  const act = (a: Parameters<typeof applyAction>[2]) => {
    const ok = applyAction(state, ME, a);
    state.tiles.forEach((t, i) => {
      if (t.owner === ME && t.outfit && t.outfit !== before[i]) {
        installed.push(t.outfit);
        before[i] = t.outfit;
      }
    });
    return ok;
  };
  const me = state.players.find((p) => p.id === ME)!;
  for (let left = me.devSeconds; left > 0 && !me.doneDeveloping; left -= 0.1) seat.developTick(state, 100, left, act); // literal-ok: a 100 ms tick
  return installed;
}

const seatOf = (options: Partial<AiSeatOptions> = {}) => new AiSeat({ id: ME, name: ME, persona: 'aggressive', level: 'trader', seed: 11, ...options });

/** Plots for the whole chain: Rare earth ground, Smithore ground and two plains plots for the works. */
const CHAIN_PLOTS = [{ x: 0, ground: { rareEarth: 4 } }, { x: 2, ground: { smithore: 4 } }, { x: 4 }, { x: 6 }];

describe('a factory chain (AM-32)', () => {
  it('B-AC-AM32-1: with Electronics dear, the seat commits to Electronics and builds an upstream mine before any works', () => {
    const state = development(CHAIN_PLOTS, 2_000);
    const seat = seatOf();
    const installed = playDevelopment(state, seat);
    expect(seat.draft(state, 'development').strategy.moneyMaker).toBe('electronics');
    expect(installed.length, `installed ${installed.join(', ')}`).toBeGreaterThan(0);
    expect(installed.every((o) => o === 'rareEarth' || o === 'smithore'), `installed ${installed.join(', ')}`).toBe(true);
    expect(installed.filter((o) => WORKS.includes(o))).toEqual([]);
  });

  it('B-AC-AM32-1: with its mines standing, the seat builds the Alloy works, and the Electronics works only after it', () => {
    const state = development([{ x: 0, ground: { rareEarth: 4 }, outfit: 'rareEarth' }, { x: 2, ground: { smithore: 4 }, outfit: 'smithore' }, { x: 4 }, { x: 6 }], 2_000);
    const installed = playDevelopment(state, seatOf());
    expect(installed[0], `installed ${installed.join(', ')}`).toBe('alloy');
    expect(installed.slice(1).every((o) => o === 'electronics')).toBe(true);
  });

  it('FM-chain-idle: no works is installed while its inputs neither stand nor are held, whatever the cash', () => {
    // Plains only: no ground for a mine, so the chain's inputs can't stand this month.
    const state = development([{ x: 0 }, { x: 2 }, { x: 4 }, { x: 6 }], 2_000);
    state.players.find((p) => p.id === ME)!.money = 50_000;
    const installed = playDevelopment(state, seatOf());
    expect(installed.filter((o) => WORKS.includes(o))).toEqual([]);
  });

  it('B-AC-AM32-1 negative: a price shock on Electronics drops the chain at the next draft point', () => {
    const state = development(CHAIN_PLOTS, 2_000);
    const seat = seatOf();
    playDevelopment(state, seat);
    expect(seat.draft(state, 'development').strategy.moneyMaker).toBe('electronics');

    // Next month, Electronics back at its base: a fall past RULE-8's shock.
    state.month++;
    state.players.find((p) => p.id === ME)!.doneDeveloping = false;
    state.store.offWorld.electronics = 220;
    state.store.posted.electronics = 220;
    expect(1 - 220 / 2_000).toBeGreaterThanOrEqual(AI_PLANS.replan.priceShock);
    const installed = playDevelopment(state, seat);
    expect(seat.replanLog().at(-1)?.trigger).toBe('priceShock');
    expect(seat.draft(state, 'development').strategy.moneyMaker).not.toBe('electronics');
    expect(installed.filter((o) => o === 'rareEarth' || WORKS.includes(o))).toEqual([]);
  });

  it('INV-chain-focus: a seat whose money-maker is not a chain plays the same development picks as a seat with no plan', () => {
    // Ground where leaning to the money-maker, Smithore, would change the picks.
    const plots = [{ x: 0 }, { x: 2, ground: { smithore: 4 } }, { x: 4 }];
    const planned = seatOf();
    const picks = playDevelopment(development(plots, 220), planned);
    expect(planned.draft(development(plots, 220), 'development').strategy.moneyMaker).toBe('smithore');
    expect(picks.length).toBeGreaterThan(0);
    expect(picks).toEqual(playDevelopment(development(plots, 220), seatOf({ playbook: false })));
  });
});
