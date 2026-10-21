import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  createRng,
  list,
  lotDone,
  observe,
  RuleError,
  setLotWalk,
  stepLandAuction,
  WALK,
  type AiPersonaId,
  type GameState,
  type Listing,
  type Tile,
} from '@mule/engine';
import { AiSeat, cashReserve, LotHand, muleValue, plotValue, type Act, type Mind } from '@mule/ai';

const SELLER = 'h';
const AIS: { id: string; name: string; persona: AiPersonaId }[] = [
  { id: 'a1', name: 'The Baron', persona: 'aggressive' },
  { id: 'a2', name: 'The Gambler', persona: 'trader' },
  { id: 'a3', name: 'The Accountant', persona: 'cautious' },
];
/** Uneven ticks, the stall clamp's longest among them, so a step can't happen to land on a limit. */
const DTS = [WALK.tickMs, WALK.tickMs * 3, 37];
const PLOT_MIN = 200;
const MULE_MIN = 400;
const SEEDS = [3, 7, 11, 19, 23, 42];
/** Within one long tick's step of the limit: the hand won't take a step that would round past it. */
const NEAR = 30;

/** The limit RULE-6 sets, worked out here from the seat's own observation. */
function limitOf(state: GameState, mind: Mind, lot: Listing): number {
  const obs = observe(state, mind.me);
  const money = obs.players.find((p) => p.id === mind.me)!.money;
  const value = lot.item.kind === 'plot' ? plotValue(obs, mind, lot.item.y * obs.width + lot.item.x) : muleValue(obs, mind);
  return Math.max(0, Math.min(money - cashReserve(obs, mind), value));
}

/**
 * Brix and three AI seats in month 1's planning. Brix owns a plot and a
 * Food MULE on another; each AI owns one idle plot, so a MULE is worth
 * something to it. Brix lists both, and the land auction opens.
 */
function landAuction(seed: number, money: Record<string, number> = {}) {
  const state = createGame({ seed, players: [{ id: SELLER, name: 'Brix', isAi: false }, ...AIS.map(({ id, name }) => ({ id, name, isAi: true }))] });
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  const own = (tile: Tile, owner: string, outfit: Tile['outfit'] = null) => Object.assign(tile, { terrain: 'plains', owner, outfit, runMonths: outfit ? 2 : 0 });
  const plot = own(free[0]!, SELLER);
  const mule = own(free[1]!, SELLER, 'food');
  AIS.forEach(({ id }, i) => own(free[2 + i]!, id));
  for (const p of state.players) p.money = money[p.id] ?? p.money;
  list(state, SELLER, { item: { kind: 'plot', x: plot.x, y: plot.y }, minimum: PLOT_MIN, unsold: 'keep' });
  list(state, SELLER, { item: { kind: 'mule', x: mule.x, y: mule.y }, minimum: MULE_MIN, unsold: 'keep' });
  while (state.phase !== 'landAuction') advancePhase(state);
  const seats = AIS.map((a, i) => new AiSeat({ id: a.id, name: a.name, persona: a.persona, level: 'trader', seed: seed * 31 + i }));
  const hands = seats.map((s, i) => new LotHand(s.mind, createRng(seed * 131 + i)));
  return { state, seats, hands, plot };
}

/** The AI's moves through the same engine calls the server makes for a phone. */
function actFor(state: GameState, id: string): Act {
  return (action) => {
    try {
      if (action.type === 'walk') setLotWalk(state, id, action.dir);
      else if (action.type === 'done') lotDone(state, id, action.done);
      return true;
    } catch (err) {
      if (err instanceof RuleError) return false;
      throw err;
    }
  };
}

interface Sample {
  lot: Listing;
  id: string;
  limit: number;
  lo: number;
  price: number;
  dir: -1 | 0 | 1;
  done: boolean;
}

/** Runs the land auction to its end, the hands ticking before each step with the same dt. Every AI walker on every walk tick. */
function play(state: GameState, hands: LotHand[]): Sample[] {
  const samples: Sample[] = [];
  const limits = new Map<string, number>();
  for (let t = 0; state.phase === 'landAuction' && t < 5_000; t++) {
    const a = state.landAuction!;
    if (a.stage === 'over') break;
    if (a.lot) for (const h of hands) if (!limits.has(`${a.lot.id}:${h.mind.me}`)) limits.set(`${a.lot.id}:${h.mind.me}`, limitOf(state, h.mind, a.lot));
    const dt = DTS[t % DTS.length]!;
    for (const h of hands) h.tick(state, dt, actFor(state, h.mind.me));
    const lot = a.lot!;
    stepLandAuction(state, dt);
    if (a.stage !== 'walk' && a.stage !== 'result') continue;
    for (const w of a.walkers) {
      if (w.id === SELLER || w.side !== 'buyer') continue;
      samples.push({ lot, id: w.id, limit: limits.get(`${lot.id}:${w.id}`)!, lo: a.lo, price: Math.round(w.price), dir: w.dir, done: a.done.includes(w.id) });
    }
  }
  return samples;
}

describe('AI seats at the land auction', () => {
  it('B-AC-7: an AI never bids above min(money − cashReserve, value)', () => {
    // Short of money, the plot's bidding stops at money − reserve; flush, the MULE's stops at its value.
    const tables: Record<string, number>[] = [{ a1: 300, a2: 340, a3: 380 }, {}];
    let capped = 0;
    for (const seed of SEEDS)
      for (const money of tables) {
        const { state, hands } = landAuction(seed, money);
        const samples = play(state, hands);
        for (const s of samples) expect(s.price, `seed ${seed}, ${s.id} on ${s.lot.id}`).toBeLessThanOrEqual(Math.max(s.limit, s.lo));
        const best = new Map<string, Sample>();
        for (const s of samples) if (s.price > (best.get(`${s.lot.id}:${s.id}`)?.price ?? -1)) best.set(`${s.lot.id}:${s.id}`, s);
        if ([...best.values()].some((s) => s.price >= s.lot.minimum && s.limit - s.price <= NEAR)) capped++;
      }
    expect(capped, 'in every run some AI bid up to its limit').toBe(SEEDS.length * tables.length);
  });

  it('B-AC-7: an AI whose money − reserve is under the minimum never moves, and presses Done', () => {
    for (const seed of [3, 7, 11]) {
      const probe = landAuction(seed);
      const mind = probe.seats[1]!.mind;
      const reserve = cashReserve(observe(probe.state, mind.me), mind);
      // A buyer by the engine's rule (money ≥ minimum), but short once it keeps its reserve.
      const money = PLOT_MIN + Math.floor(reserve / 2);
      const { state, hands } = landAuction(seed, { a2: money });
      const mine = play(state, hands).filter((s) => s.id === 'a2' && s.lot.item.kind === 'plot');
      expect(mine.length).toBeGreaterThan(0);
      for (const s of mine) {
        expect(s.limit).toBeLessThan(PLOT_MIN);
        expect(s.price, `seed ${seed}`).toBe(s.lo);
        expect(s.dir).toBe(0);
      }
      expect(mine.some((s) => s.done)).toBe(true);
    }
  });
});
