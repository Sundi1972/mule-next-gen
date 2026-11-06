import { describe, expect, it } from 'vitest';
import { advancePhase, AI_PLANS, createGame, GOODS, observe, type GameState, type Good, type Outfit, type Stock, type Strategy, type Tile } from '@mule/engine';
import { applyAction } from '../src/play.js';
import { draftPlanningPart, draftStrategyOf } from '../src/playbook/draft.js';
import { AiSeat, type AiSeatOptions } from '../src/seat.js';
import { outlook } from '../src/outlook.js';
import { developDecision } from '../src/strategist.js';
import { canFeed, chainInputs, chainLinks, chainOf, chainOutlook, installGain, linkShare, standingLinks, type Mind } from '../src/value.js';

/** A seat whose Electronics fetch a high price builds the chain to them, upstream first. See AM-33. */

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

/**
 * Electronics dear enough that the chain wins with a clear margin. On CHAIN_PLOTS one works and its links (SA-1371)
 * starts to beat Smithore between 1950 and 2000: a test on that edge breaks on any valuation change.
 */
const DEAR = 2_500;

/** The switch-on value under test: AI_PLANS.chain.months ships at 0, which switches chains off. */
const CHAIN_ON_MONTHS = 3;

/** Runs `fn` with chains switched on, then puts the switch back. */
function withChains<T>(fn: () => T): T {
  const shipped = AI_PLANS.chain.months;
  AI_PLANS.chain.months = CHAIN_ON_MONTHS;
  try {
    return fn();
  } finally {
    AI_PLANS.chain.months = shipped;
  }
}

/** RULE-4 before AM-33: the best of the goods the seat can feed, by its best plots' install gains, less the rivals' share. */
function fedMoneyMaker(state: GameState, mind: Mind): Good | null {
  const obs = observe(state, mind.me);
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const plots = obs.tiles.filter((t) => t.terrain !== 'store' && (t.owner === null || (t.owner === mind.me && !t.outfit)));
  let best: { good: Good; score: number } | null = null;
  for (const good of GOODS.filter((g) => canFeed(obs, mind.me, g))) {
    const sum = plots.map((t) => installGain(obs, o, t, good, mind).gain).sort((a, b) => b - a).slice(0, AI_PLANS.moneyMaker.plots).reduce((n, g) => n + g, 0);
    const rivals = obs.tiles.filter((t) => t.owner !== null && t.owner !== mind.me && t.outfit === good).length;
    const score = sum * (1 - AI_PLANS.moneyMaker.rivalDiscount * rivals);
    if (score > 0 && (!best || score > best.score)) best = { good, score };
  }
  return best?.good ?? null;
}

describe('a factory chain (AM-33)', () => {
  it('B-AC-11: with Electronics dear, the seat commits to Electronics and builds an upstream mine before any works', () => withChains(() => {
    const state = development(CHAIN_PLOTS, DEAR);
    const seat = seatOf();
    const installed = playDevelopment(state, seat);
    expect(seat.draft(state, 'development').strategy.moneyMaker).toBe('electronics');
    expect(installed.length, `installed ${installed.join(', ')}`).toBeGreaterThan(0);
    expect(installed.every((o) => o === 'rareEarth' || o === 'smithore'), `installed ${installed.join(', ')}`).toBe(true);
    expect(installed.filter((o) => WORKS.includes(o))).toEqual([]);
  }));

  it('B-AC-11: with its mines standing, the seat builds the Alloy works, and the Electronics works only after it', () => withChains(() => {
    const state = development([{ x: 0, ground: { rareEarth: 4 }, outfit: 'rareEarth' }, { x: 2, ground: { smithore: 4 }, outfit: 'smithore' }, { x: 4 }, { x: 6 }], DEAR);
    const installed = playDevelopment(state, seatOf());
    expect(installed[0], `installed ${installed.join(', ')}`).toBe('alloy');
    expect(installed.slice(1).every((o) => o === 'electronics')).toBe(true);
  }));

  it('B-AC-11 (FM-chain-dry-link): a link plot that makes nothing adds nothing to the chain, so no mine goes onto dry ground', () => withChains(() => {
    // Rare earth only on ground the seat knows is dry; Smithore ground and plains for the rest.
    const state = development([{ x: 0 }, { x: 2, ground: { smithore: 4 } }, { x: 4 }, { x: 6 }], DEAR);
    const installed = playDevelopment(state, seatOf());
    expect(installed, `installed ${installed.join(', ')}`).not.toContain('rareEarth');
  }));

  it('B-AC-11: a chain under way is re-drafted on what is left to build: its standing link at running cost, cash for the missing links only', () => withChains(() => {
    // The Smithore mine stands on thin ground (one a month, the Alloy works wants two), so Smithore is still short; the
    // cash pays the works, the Rare earth mine and the Alloy works, not a second Smithore mine as well. Electronics at a
    // price where the chain wins by less than the standing mine's outfit (75 cr): it wins only while the mine counts at
    // its running cost, with no install price (M7).
    const state = development([{ x: 0, ground: { rareEarth: 4 } }, { x: 2, ground: { smithore: 1 }, outfit: 'smithore' }, { x: 4 }, { x: 6 }], 3_772);
    state.players.find((p) => p.id === ME)!.money = 1_000;
    const seat = seatOf();
    const redraft = draftStrategyOf({ state, seat: ME, mind: seat.mind, seed: 11, phase: 'development', kept: null, replanned: 'election' });
    expect(redraft.moneyMaker).toBe('electronics');
  }));

  it('B-AC-11: a seat short of cash keeps its chain\'s standing links off the land auction while the chain is its plan', () => withChains(() => {
    // Planning, broke: a Smithore mine on thin ground (worth little at the market) is what a short seat lists first.
    const state = development([{ x: 0, ground: { smithore: 1 }, outfit: 'smithore' }, { x: 2, ground: { food: 2 }, outfit: 'food' }, { x: 4, outfit: 'energy' }], DEAR);
    state.phase = 'planning';
    state.players.find((p) => p.id === ME)!.money = 0;
    const strategy = (moneyMaker: Good): Strategy => ({ kind: 'specialist', moneyMaker, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 3, byMonth: 2 }, stances: {}, reason: '' });
    const listed = (moneyMaker: Good) => (draftPlanningPart({ state, seat: ME, mind: seatOf().mind, seed: 11, phase: 'planning', strategy: strategy(moneyMaker) }).list ?? []).map((l) => l.plot);
    expect(listed('food'), 'without a chain the mine is listed').toContain(0);
    expect(listed('electronics')).not.toContain(0);
  }));

  it('B-AC-11: one set of links feeds one works, so a chain is scored as one works and its links, never as three works', () => withChains(() => {
    // Electronics at a price where three works plots' gains with one set of links would win, and one works with its
    // links, what the seat would build, does not.
    const state = development(CHAIN_PLOTS, 1_500);
    expect(draftStrategyOf({ state, seat: ME, mind: seatOf().mind, seed: 11, phase: 'development' }).moneyMaker).not.toBe('electronics');
  }));

  it("B-AC-11: the works' charge for the inputs its own links make is refunded, end to end", () => withChains(() => {
    // Electronics at a price where the chain wins only with its works' input charge refunded (M8).
    const state = development(CHAIN_PLOTS, 2_075);
    expect(draftStrategyOf({ state, seat: ME, mind: seatOf().mind, seed: 11, phase: 'development' }).moneyMaker).toBe('electronics');
  }));

  it('B-AC-11: a short seat lists a spare Smithore MULE when its Alloy money-maker is fed, and keeps a standing link of an unfed chain', () => withChains(() => {
    // Planning, broke, its Food and Energy MULEs its last (never listed): a Smithore mine is the one lot it can list.
    const listed = (smithore: number, moneyMaker: Good) => {
      const state = development([{ x: 0, ground: { smithore }, outfit: 'smithore' }, { x: 2, ground: { food: 2 }, outfit: 'food' }, { x: 4, outfit: 'energy' }], DEAR);
      state.phase = 'planning';
      state.players.find((p) => p.id === ME)!.money = 0;
      expect(canFeed(state, ME, 'alloy'), `Alloy fed on Smithore ground ${smithore}`).toBe(smithore >= 4);
      const strategy: Strategy = { kind: 'specialist', moneyMaker, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 3, byMonth: 2 }, stances: {}, reason: '' };
      return (draftPlanningPart({ state, seat: ME, mind: seatOf().mind, seed: 11, phase: 'planning', strategy }).list ?? []).map((l) => l.plot);
    };
    // Fed: the mine is no link, and it is listed as without a chain.
    expect(listed(4, 'food'), 'without a chain the mine is listed').toContain(0);
    expect(listed(4, 'alloy')).toEqual(listed(4, 'food'));
    // Unfed: the mine is the chain's standing link, kept.
    expect(listed(1, 'food')).toContain(0);
    expect(listed(1, 'alloy')).not.toContain(0);
  }));

  it("B-AC-11: with an Alloy works standing, the strategist values a Smithore link by the draft's chain: its share of Alloy's 2 a run", () => withChains(() => {
    // The Alloy works stands, unfed; no Smithore mine yet. Smithore ground making 1 a month (plot 4) and 3 (plot 6).
    const state = development([{ x: 0, ground: { rareEarth: 4 }, outfit: 'rareEarth' }, { x: 2, outfit: 'alloy' }, { x: 4, ground: { smithore: 1 } }, { x: 6, ground: { smithore: 3 } }, { x: 8, outfit: 'energy' }], DEAR);
    const mind = seatOf().mind;
    const obs = observe(state, ME);
    // The draft's chain (chainOf): Smithore its one link, the standing Alloy works a member.
    const { links, members } = chainOf(obs, ME, 'electronics');
    expect(links).toEqual(['smithore']);
    expect(members).toContain('alloy');
    const thin = obs.tiles[4]!;
    expect(linkShare(obs, thin, 'smithore', members, ME), 'one a month of the Alloy works\' 2').toBe(0.5);
    // What a link MULE is worth, read the draft's way: its running cost plus its share of the best works' gain.
    const valued = chainOutlook(outlook(obs, ME, { lookAhead: mind.level.lookAhead }), members.slice(1));
    const ground = obs.tiles.filter((t) => t.terrain !== 'store' && (t.owner === null || (t.owner === ME && !t.outfit)));
    const works = Math.max(...ground.map((t) => installGain(obs, valued, t, 'electronics', mind).gain));
    const values = new Map(developDecision(obs, mind, 0, undefined, 'electronics').all.map((c) => [c.key, c.value]));
    for (const x of [4, 6]) {
      const t = obs.tiles[x]!;
      const expected = installGain(obs, valued, t, 'smithore', mind).gain + linkShare(obs, t, 'smithore', members, ME) * works;
      // A candidate's value is in whole credits.
      expect(values.get(`install:smithore:${x}`), `plot ${x}`).toBe(Math.round(expected));
    }
  }));

  it('FM-chain-idle: no works is installed while its inputs neither stand nor are held, whatever the cash', () => withChains(() => {
    // Plains only: no ground for a mine, so the chain's inputs can't stand this month.
    const state = development([{ x: 0 }, { x: 2 }, { x: 4 }, { x: 6 }], DEAR);
    state.players.find((p) => p.id === ME)!.money = 50_000;
    const installed = playDevelopment(state, seatOf());
    expect(installed.filter((o) => WORKS.includes(o))).toEqual([]);
  }));

  it('B-AC-11 negative: a price shock on Electronics drops the chain at the next draft point', () => withChains(() => {
    const state = development(CHAIN_PLOTS, DEAR);
    const seat = seatOf();
    playDevelopment(state, seat);
    expect(seat.draft(state, 'development').strategy.moneyMaker).toBe('electronics');

    // Next month, Electronics back at its base: a fall past RULE-8's shock.
    state.month++;
    state.players.find((p) => p.id === ME)!.doneDeveloping = false;
    state.store.offWorld.electronics = 220;
    state.store.posted.electronics = 220;
    expect(1 - 220 / DEAR).toBeGreaterThanOrEqual(AI_PLANS.replan.priceShock);
    const installed = playDevelopment(state, seat);
    expect(seat.replanLog().at(-1)?.trigger).toBe('priceShock');
    expect(seat.draft(state, 'development').strategy.moneyMaker).not.toBe('electronics');
    expect(installed.filter((o) => o === 'rareEarth' || WORKS.includes(o))).toEqual([]);
  }));

  it('INV-chain-focus: a seat whose money-maker is not a chain plays the same development picks as a seat with no plan', () => withChains(() => {
    // Ground where leaning to the money-maker, Smithore, would change the picks.
    const plots = [{ x: 0 }, { x: 2, ground: { smithore: 4 } }, { x: 4 }];
    const planned = seatOf();
    const picks = playDevelopment(development(plots, 220), planned);
    expect(planned.draft(development(plots, 220), 'development').strategy.moneyMaker).toBe('smithore');
    expect(picks.length).toBeGreaterThan(0);
    expect(picks).toEqual(playDevelopment(development(plots, 220), seatOf({ playbook: false })));
  }));
});

describe('the chain switch (AM-33, PM ruling B)', () => {
  it('INV-chain-off: at the shipped AI_PLANS.chain.months, a chain-eligible seat drafts the money-maker RULE-4 drafted before AM-33', () => {
    const state = development(CHAIN_PLOTS, DEAR);
    const seat = seatOf();
    const drafted = draftStrategyOf({ state, seat: ME, mind: seat.mind, seed: 11, phase: 'development' }).moneyMaker;
    expect(drafted).toBe(fedMoneyMaker(state, seat.mind));
    expect(withChains(() => draftStrategyOf({ state, seat: ME, mind: seat.mind, seed: 11, phase: 'development' }).moneyMaker), 'switched on, a chain').toBe('electronics');
    // Every chain helper answers none while switched off, not only the draft's row (a guard on the helpers themselves).
    expect(chainLinks(state, ME, 'electronics'), 'no links').toEqual([]);
    expect(chainInputs(state, ME, 'electronics'), 'no inputs').toEqual([]);
    expect(standingLinks(state, ME, 'electronics'), 'no standing links').toEqual([]);
    expect(withChains(() => chainInputs(state, ME, 'electronics')), 'switched on, the recipe closure').not.toEqual([]);
  });

  it('INV-chain-off: at the shipped AI_PLANS.chain.months, a seat short of cash lists the same lot whatever its money-maker', () => {
    const state = development([{ x: 0, ground: { smithore: 1 }, outfit: 'smithore' }, { x: 2, ground: { food: 2 }, outfit: 'food' }, { x: 4, outfit: 'energy' }], DEAR);
    state.phase = 'planning';
    state.players.find((p) => p.id === ME)!.money = 0;
    const strategy = (moneyMaker: Good): Strategy => ({ kind: 'specialist', moneyMaker, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 3, byMonth: 2 }, stances: {}, reason: '' });
    const listed = (moneyMaker: Good) => (draftPlanningPart({ state, seat: ME, mind: seatOf().mind, seed: 11, phase: 'planning', strategy: strategy(moneyMaker) }).list ?? []).map((l) => l.plot);
    expect(listed('electronics'), 'an Electronics plan keeps no link back while chains are off').toContain(0);
    expect(listed('electronics')).toEqual(listed('food'));
  });
});
