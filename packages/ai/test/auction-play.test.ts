import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  createRng,
  MS_PER_SECOND,
  observe,
  SHIP_ID,
  stableJson,
  stepAuction,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type Good,
  type GoodPlay,
  type Trade,
} from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { AuctionHand } from '../src/hands/auction.js';
import { applyAction } from '../src/play.js';
import { draftGoodPlaybook, draftPlaybook } from '../src/playbook/draft.js';
import { validatePlaybook } from '../src/playbook/validate.js';
import { AiSeat } from '../src/seat.js';
import { goodPlan } from '../src/strategist.js';

/**
 * C7 · RULE-10: on the playbook path the auction hand plays the good's part. The parity half builds today's hand and the
 * playbook hand from the same seat seed and the same status-time state (re-grounding H-2: no baseline pins today's acts),
 * spies on every Act and compares; the binding half edits one field of the seat's own draft and watches the walk move.
 */

const SEATS: { persona: AiPersonaId; level: AiLevelId }[] = [
  { persona: 'trader', level: 'trader' },
  { persona: 'cautious', level: 'tycoon' },
  { persona: 'aggressive', level: 'rookie' },
  { persona: 'saboteur', level: 'tycoon' },
];

/** The table's seats, as the sim builds them: fresh for every run, so each run starts from the same seeds. */
const seatsFor = (seed: number) => SEATS.map((s, i) => new AiSeat({ id: `ai${i}`, name: `AI ${i + 1}`, ...s, seed: seed * 10 + i }));

/** The playbook hand for a seat, its rng seeded as AiSeat seeds its own auction hand, so both hands draw the same noise. */
const handFor = (seat: AiSeat, play: (state: GameState, good: Good) => GoodPlay | null) =>
  new AuctionHand(seat.brain, createRng((seat.options.seed ^ 0x85ebca6b) >>> 0), play); // literal-ok: AiSeat's salt for the auction hand's rng

/** The seat's own fresh one-good draft at the good's status screen (AM-20). */
const ownDraft = (seat: AiSeat, state: GameState, good: Good): GoodPlay =>
  draftGoodPlaybook({ state, seat: seat.id, mind: seat.mind, seed: seat.options.seed }, good).auction![good]!;

/** Month 1's auction for a four-seat table, arranged so most goods have sellers and buyers. */
function auctionTable(seed: number, arrange: (state: GameState) => void): GameState {
  const state = createGame({ seed, players: SEATS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  arrange(state);
  return state;
}

/** Each good's status screen as the table meets it, before any hand has seen the good: one auction played by today's hands. */
function statusScreens(state: GameState, seed: number): GameState[] {
  const seats = seatsFor(seed);
  const screens: GameState[] = [];
  let last: Good | null = null;
  for (let i = 0; i < 40_000 && state.auction!.stage !== 'over'; i++) {
    const a = state.auction!;
    if (a.stage === 'status' && a.good !== last) {
      screens.push(structuredClone(state));
      last = a.good;
    }
    for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
    stepAuction(state, WALK.tickMs);
  }
  return screens;
}

interface GoodRun {
  /** The seat's acts, each with its tick and whether the rules took it. */
  acts: string[];
  trades: Trade[];
  /** The seat's rounded price on the board at each walk tick, with the walk's elapsed ms. */
  path: { elapsed: number; price: number }[];
  lineUnits: number[];
  state: GameState;
}

/**
 * One good from its status screen to its close. Seat `k` plays by today's hand (no `play`) or by the playbook hand; the
 * other seats play today's hands from the same seeds.
 */
function runGood(screen: GameState, seed: number, k: number, play?: (state: GameState, good: Good) => GoodPlay | null): GoodRun {
  const state = structuredClone(screen);
  const good = state.auction!.good!;
  const seats = seatsFor(seed);
  const me = seats[k]!;
  const hand = play ? handFor(me, play) : null;
  const run: GoodRun = { acts: [], trades: [], path: [], lineUnits: [], state };
  for (let tick = 0; tick < 2_000; tick++) {
    const a = state.auction!;
    if (a.good !== good || a.stage === 'close' || a.stage === 'over') break;
    for (const s of seats) {
      const act = (x: AiAction) => applyAction(state, s.id, x);
      if (s !== me) {
        s.auctionTick(state, WALK.tickMs, act);
        continue;
      }
      const spy = (x: AiAction) => {
        const ok = act(x);
        run.acts.push(`${tick} ${stableJson(x)} ${ok}`);
        if (x.type === 'lineTrade' && ok) run.lineUnits.push(x.units);
        return ok;
      };
      if (hand) hand.tick(state, WALK.tickMs, spy);
      else s.auctionTick(state, WALK.tickMs, spy);
    }
    run.trades.push(...stepAuction(state, WALK.tickMs));
    const w = state.auction!.walkers.find((x) => x.id === me.id);
    if (state.auction!.stage === 'walk' && w) run.path.push({ elapsed: state.auction!.elapsed, price: Math.round(w.price) });
  }
  return run;
}

/** Today's TradeAction for seat `k` at a screen, as its hand settles it on the first tick: side and the units it ends with. */
function todaysTrade(screen: GameState, seed: number, k: number): { side: string; goal: number | null } {
  const state = structuredClone(screen);
  const seat = seatsFor(seed)[k]!;
  seat.auctionTick(state, WALK.tickMs, () => true);
  const d = seat.debug().auction!;
  return { side: d.side ?? 'pass', goal: d.goal };
}

const SEEDS = [1, 2, 3, 5, 7];
const arrange = (state: GameState) => {
  const [a, b, c, d] = state.players;
  a!.stock.food = 30;
  b!.stock.food = 0;
  b!.money = 2_000;
  c!.stock.smithore = 25;
  d!.stock.energy = 0;
  d!.money = 1_500;
};

/** Seed 5's food screen: ai0 holds 30 Food to sell, ai1 none and 2,000 to buy with. */
function foodScreen(): GameState {
  const screen = statusScreens(auctionTable(5, arrange), 5).find((s) => s.auction!.good === 'food');
  if (!screen) throw new Error('seed 5 has no food screen');
  return screen;
}

const bought = (run: GoodRun, id: string) => run.trades.filter((t) => t.buyer === id);
const sold = (run: GoodRun, id: string) => run.trades.filter((t) => t.seller === id);
const stockOf = (run: GoodRun, id: string, good: Good) => run.state.players.find((p) => p.id === id)!.stock[good];

/**
 * A walk probe: seat ai1 buys Food by `part`; once the walk starts, ai1 stands at `mine`, ai2 (a rival buyer) at
 * `rival` (or passes), and ai0 asks at `ask`. Only ai1 moves, so what it does is its aim against that board.
 */
function probe(screen: GameState, part: GoodPlay, board: { mine: number; rival: number | null; ask: number }, ticks = 150) {
  const state = structuredClone(screen);
  state.store.stock.food = 0;
  const seat = seatsFor(5)[1]!;
  const hand = handFor(seat, () => structuredClone(part));
  const acts: string[] = [];
  const targets: (number | null)[] = [];
  let top = -Infinity;
  for (let i = 0; i < 200 && state.auction!.stage === 'status'; i++) {
    hand.tick(state, WALK.tickMs, (x) => applyAction(state, seat.id, x));
    for (const p of state.players) if (p.id !== seat.id) applyAction(state, p.id, { type: 'done', done: true });
    stepAuction(state, WALK.tickMs);
  }
  const a = state.auction!;
  for (const w of a.walkers) {
    if (w.id === 'ai1') Object.assign(w, { side: 'buyer', price: board.mine, dir: 0 });
    if (w.id === 'ai2') Object.assign(w, board.rival === null ? { side: 'pass', price: 0, dir: 0 } : { side: 'buyer', price: board.rival, dir: 0 });
    if (w.id === 'ai0') Object.assign(w, { side: 'seller', price: board.ask, dir: 0 });
    if (w.id === 'ai3') Object.assign(w, { side: 'pass', price: 0, dir: 0 });
  }
  state.players.find((p) => p.id === 'ai2')!.money = 5_000;
  for (let i = 0; i < ticks && state.auction!.stage === 'walk'; i++) {
    hand.tick(state, WALK.tickMs, (x) => {
      acts.push(`${i} ${stableJson(x)}`);
      return applyAction(state, seat.id, x);
    });
    targets.push(hand.debug()?.target ?? null);
    stepAuction(state, WALK.tickMs);
    top = Math.max(top, Math.round(state.auction!.walkers.find((w) => w.id === 'ai1')!.price));
  }
  return { acts, targets, top, limit: hand.debug()?.limit ?? null };
}

/**
 * The seller's walk probe, the mirror of `probe`: seat ai0 sells Food by `part`; once the walk starts, ai0 stands at
 * `mine`, ai2 (a rival seller) at `rival`, and ai1 bids at `bid`; the store buys nothing. Only ai0 moves. The lowest
 * price it stood at.
 */
function sellerProbe(screen: GameState, part: GoodPlay, board: { mine: number; rival: number; bid: number }, ticks = 150): number {
  const state = structuredClone(screen);
  const seat = seatsFor(5)[0]!;
  const hand = handFor(seat, () => structuredClone(part));
  for (let i = 0; i < 200 && state.auction!.stage === 'status'; i++) {
    hand.tick(state, WALK.tickMs, (x) => applyAction(state, seat.id, x));
    for (const p of state.players) if (p.id !== seat.id) applyAction(state, p.id, { type: 'done', done: true });
    stepAuction(state, WALK.tickMs);
  }
  const a = state.auction!;
  a.storeBudget = 0;
  for (const w of a.walkers) {
    if (w.id === 'ai0') Object.assign(w, { side: 'seller', price: board.mine, dir: 0 });
    if (w.id === 'ai2') Object.assign(w, { side: 'seller', price: board.rival, dir: 0 });
    if (w.id === 'ai1') Object.assign(w, { side: 'buyer', price: board.bid, dir: 0 });
    if (w.id === 'ai3') Object.assign(w, { side: 'pass', price: 0, dir: 0 });
  }
  state.players.find((p) => p.id === 'ai2')!.stock.food = 10;
  let bottom = Infinity;
  for (let i = 0; i < ticks && state.auction!.stage === 'walk'; i++) {
    hand.tick(state, WALK.tickMs, (x) => applyAction(state, seat.id, x));
    stepAuction(state, WALK.tickMs);
    bottom = Math.min(bottom, Math.round(state.auction!.walkers.find((w) => w.id === 'ai0')!.price));
  }
  return bottom;
}

/**
 * A line probe: seat ai1 buys Food by `part`, standing at the store's ask once the walk starts, on a board whose step
 * passes a credit a tick, as a dear good's does (Medicine's is 1.6 cr): a target a credit under the line leaves it
 * standing there. ai0 asks at the top and keeps the walk open. Its acts in the walk, and the Food it ends with.
 */
function lineProbe(screen: GameState, part: GoodPlay, ticks = 60): { acts: string[]; food: number } {
  const state = structuredClone(screen);
  const seat = seatsFor(5)[1]!;
  const hand = handFor(seat, () => structuredClone(part));
  for (let i = 0; i < 200 && state.auction!.stage === 'status'; i++) {
    hand.tick(state, WALK.tickMs, (x) => applyAction(state, seat.id, x));
    for (const p of state.players) if (p.id !== seat.id) applyAction(state, p.id, { type: 'done', done: true });
    stepAuction(state, WALK.tickMs);
  }
  const a = state.auction!;
  a.speed = (2 * MS_PER_SECOND) / WALK.tickMs; // literal-ok: two credits a tick
  a.done = [];
  for (const w of a.walkers) {
    if (w.id === 'ai1') Object.assign(w, { side: 'buyer', price: a.storeSell, dir: 0 });
    else if (w.id === 'ai0') Object.assign(w, { side: 'seller', price: a.hi, dir: 0 });
    else Object.assign(w, { side: 'pass', price: 0, dir: 0 });
  }
  const acts: string[] = [];
  for (let i = 0; i < ticks && state.auction!.stage === 'walk'; i++) {
    hand.tick(state, WALK.tickMs, (x) => {
      acts.push(stableJson(x));
      return applyAction(state, seat.id, x);
    });
    stepAuction(state, WALK.tickMs);
  }
  return { acts, food: state.players.find((p) => p.id === 'ai1')!.stock.food };
}

describe('AM-20: the one-good draft', () => {
  it('T-AC-8 · AM-20: at a good\'s status screen the one-good draft carries only that good, as the month\'s draft drafts it there, and passes the gate', () => {
    const screens = statusScreens(auctionTable(5, arrange), 5);
    expect(screens.length).toBeGreaterThan(1);
    for (const screen of screens) {
      const good = screen.auction!.good!;
      for (const seat of seatsFor(5)) {
        const input = { state: screen, seat: seat.id, mind: seat.mind, seed: seat.options.seed };
        const one = draftGoodPlaybook(input, good);
        const month = draftPlaybook({ ...input, phase: 'auction' });
        expect(Object.keys(one.auction!)).toEqual([good]);
        expect(one.auction![good]).toEqual(month.auction![good]);
        expect({ ...one, auction: undefined }).toEqual({ ...month, auction: undefined });
        const gated = validatePlaybook({ mind: seat.mind, seed: seat.options.seed })(screen, seat.id, one, []);
        expect(gated.rejected).toEqual([]);
        expect(gated.playbook.auction).toEqual(one.auction);
      }
    }
  });
});

describe('C7 · RULE-10: the auction hand plays the good part', () => {
  it('T-AC-8: with the draft\'s defaults the acts are today\'s, tick for tick; each binding field moves the walk', { timeout: 120_000 }, () => {
    // ── Parity: each good's own fresh one-good draft, played, sends today's acts tick for tick, from the same seed and screen.
    let compared = 0;
    let picksDiffer = 0;
    for (const seed of SEEDS) {
      for (const screen of statusScreens(auctionTable(seed, arrange), seed)) {
        for (let k = 0; k < SEATS.length; k++) {
          const parts: GoodPlay[] = [];
          const playbook = runGood(screen, seed, k, (state, good) => {
            parts.push(ownDraft(seatsFor(seed)[k]!, state, good));
            return parts.at(-1)!;
          });
          const today = runGood(screen, seed, k);
          const trade = todaysTrade(screen, seed, k);
          expect(parts.length, 'the hand asks for the good part once, at its status screen').toBe(1);
          const p = parts[0]!;
          const sameRoleAndHold = (p.role === 'out' ? 'pass' : p.role) === trade.side && (trade.side === 'pass' || p.hold === trade.goal);
          // RULE-10's parity is for the same role and hold; the draft's own seeded TopPick may land elsewhere on a tie.
          if (!sameRoleAndHold) {
            picksDiffer++;
            continue;
          }
          compared++;
          const at = `seed ${seed}, ${screen.auction!.good}, ai${k}`;
          expect(playbook.acts, at).toEqual(today.acts);
          expect(playbook.trades, at).toEqual(today.trades);
        }
      }
    }
    expect(compared, 'goods compared tick for tick').toBeGreaterThanOrEqual(60);
    expect(picksDiffer, 'goods whose draft pick differs from today\'s').toBeLessThanOrEqual(compared / 4);

    // ── Binding: one field of the seat's own draft edited at a time.
    const screen = foodScreen();
    const draftOf = (k: number) => ownDraft(seatsFor(5)[k]!, screen, 'food');
    const buyer = draftOf(1);
    const seller = draftOf(0);
    expect(buyer.role).toBe('buyer');
    expect(seller.role).toBe('seller');
    const today = runGood(screen, 5, 1);
    expect(bought(today, 'ai1').length, 'today the buyer buys Food').toBeGreaterThan(0);

    // walkAway under today's ceiling caps the buyer: no unit over it, and it never stands over it.
    const top = Math.max(...bought(today, 'ai1').map((t) => t.price));
    const walkAway = top - 3;
    const capped = runGood(screen, 5, 1, () => ({ ...buyer, walkAway, start: walkAway }));
    expect(bought(capped, 'ai1').every((t) => t.price <= walkAway)).toBe(true);
    expect(Math.max(...capped.path.map((s) => s.price))).toBeLessThanOrEqual(walkAway);
    expect(today.path.some((s) => s.price > walkAway), 'the cap binds: today it stood higher').toBe(true);

    // A seller's walkAway over today's floor: it sells no unit under it.
    const todaySells = sold(runGood(screen, 5, 0), 'ai0');
    expect(todaySells.length).toBeGreaterThan(0);
    const low = Math.min(...todaySells.map((t) => t.price));
    const floored = runGood(screen, 5, 0, () => ({ ...seller, walkAway: low + 3, start: low + 3 }));
    expect(sold(floored, 'ai0').every((t) => t.price >= low + 3)).toBe(true);

    // concede 2 cr/s from a start under the board holds the buyer at start + 2t, under walkAway. It may stand where the
    // board put it (lo) until the schedule passes that, and steer stops on the first rounded price at or over its target.
    const lo = screen.auction!.lo;
    const start = lo - 3;
    const bound = (elapsed: number) => Math.max(lo, Math.ceil(Math.min(buyer.walkAway, start + (2 * elapsed) / MS_PER_SECOND)));
    const conceding = runGood(screen, 5, 1, () => ({ ...buyer, start, concedeCrPerS: 2 }));
    expect(conceding.path.length).toBeGreaterThan(0);
    for (const s of conceding.path) expect(s.price, `at ${s.elapsed} ms`).toBeLessThanOrEqual(bound(s.elapsed));
    expect(today.path.some((s) => s.price > bound(s.elapsed)), 'the schedule binds: today it stood higher').toBe(true);
    expect(Math.max(...conceding.path.map((s) => s.price)), 'it concedes over time').toBeGreaterThan(lo);
    // The seller's mirror: from a start over the board it holds at start - 2t or over, above walkAway, and may stand at
    // hi until the schedule passes it; steer stops on the first rounded price at or under its target.
    const hi = screen.auction!.hi;
    const sellStart = hi + 3;
    const sellBound = (elapsed: number) => Math.min(hi, Math.floor(Math.max(seller.walkAway, sellStart - (2 * elapsed) / MS_PER_SECOND)));
    const todaySeller = runGood(screen, 5, 0);
    const sellerConceding = runGood(screen, 5, 0, () => ({ ...seller, start: sellStart, concedeCrPerS: 2 }));
    expect(sellerConceding.path.length).toBeGreaterThan(0);
    for (const s of sellerConceding.path) expect(s.price, `at ${s.elapsed} ms`).toBeGreaterThanOrEqual(sellBound(s.elapsed));
    expect(todaySeller.path.some((s) => s.price < sellBound(s.elapsed)), 'the schedule binds: today it stood lower').toBe(true);
    expect(Math.min(...sellerConceding.path.map((s) => s.price)), 'it concedes over time').toBeLessThan(hi);

    // hold: a seller stops at its hold (a deal under way may move a unit or two more before it re-aims, as today), never
    // under the Food it needs; a buyer buys up to its hold.
    const had = screen.players[0]!.stock.food;
    const keeps = runGood(screen, 5, 0, () => ({ ...seller, hold: had - 2 }));
    expect(sold(keeps, 'ai0').length).toBeGreaterThan(0);
    expect(sold(keeps, 'ai0').length).toBeLessThan(todaySells.length / 2);
    const floorUnits = goodPlan(observe(screen, 'ai0'), seatsFor(5)[0]!.mind, 'food').values.floorUnits;
    expect(floorUnits).toBeGreaterThan(0);
    const all = runGood(screen, 5, 0, () => ({ ...seller, hold: 0, walkAway: 1, start: 1 }));
    expect(stockOf(all, 'ai0', 'food')).toBeGreaterThanOrEqual(floorUnits);
    const one = runGood(screen, 5, 1, () => ({ ...buyer, hold: 1 }));
    expect(bought(one, 'ai1').length).toBe(1);

    // role: out passes and trades nothing; a seller told to buy declares a buyer.
    const out = runGood(screen, 5, 1, () => ({ ...buyer, role: 'out' }));
    expect(out.acts.some((x) => x.includes('"type":"declare"') && x.includes('"side":"pass"'))).toBe(true);
    expect(out.trades.filter((t) => t.buyer === 'ai1' || t.seller === 'ai1')).toEqual([]);
    const turned = runGood(screen, 5, 0, () => ({ ...seller, role: 'buyer', hold: had }));
    expect(turned.acts.some((x) => x.includes('"type":"declare"') && x.includes('"side":"buyer"'))).toBe(true);

    // bluff: it declares its side, aims at the far edge, presses Done and trades nothing.
    const bluffSeller = runGood(screen, 5, 0, () => ({ ...seller, bluff: true }));
    expect(bluffSeller.acts.some((x) => x.includes('"side":"seller"'))).toBe(true);
    expect(bluffSeller.acts.some((x) => x.includes('{"done":true,"type":"done"}'))).toBe(true);
    expect(sold(bluffSeller, 'ai0')).toEqual([]);
    expect(bluffSeller.path.at(-1)!.price).toBe(screen.auction!.hi);
    const bluffBuyer = runGood(screen, 5, 1, () => ({ ...buyer, bluff: true }));
    expect(bluffBuyer.acts.some((x) => x.includes('"side":"buyer"'))).toBe(true);
    expect(bought(bluffBuyer, 'ai1')).toEqual([]);

    // vsRival, against a rival buyer ahead at 20, the seller asking 40: undercut1 aims one over it; hold never does (it
    // aims and acts as with no rival there); yield stands one behind it; per names the stance for that rival. The aim is
    // read off the hand's debug view: past the rival, an overtake and the walk on look alike in the acts.
    const W = 30;
    const base: GoodPlay = { ...buyer, hold: buyer.hold + 5, walkAway: W, start: W };
    const board = { mine: 8, rival: 20, ask: 40 };
    const undercut = probe(screen, { ...base, vsRival: 'undercut1' }, board);
    expect(undercut.limit, 'the probe buyer values Food over its walkAway').toBe(W);
    expect(undercut.targets).toContain(21);
    expect(undercut.top).toBeGreaterThan(20);
    const alone = probe(screen, { ...base, vsRival: 'undercut1' }, { ...board, rival: null });
    expect(alone.targets).not.toContain(21);
    const hold = probe(screen, { ...base, vsRival: 'hold' }, board);
    expect(hold.targets).toEqual(alone.targets);
    expect(hold.acts).toEqual(alone.acts);
    const yieldTop = probe(screen, { ...base, vsRival: 'yield' }, board).top;
    expect(yieldTop).toBe(19);
    expect(probe(screen, { ...base, vsRival: 'undercut1', per: { ai2: 'yield' } }, board).top).toBe(19);
    expect(probe(screen, { ...base, vsRival: 'yield', per: { ai2: 'undercut1' } }, board).targets).toEqual(undercut.targets);
    // The seller's mirror, against a rival seller ahead at 20 and a bid at 8: yield stands one behind it, over it.
    const sellBase: GoodPlay = { ...seller, hold: 0, walkAway: 10, start: 10 };
    const sellBoard = { mine: 40, rival: 20, bid: 8 };
    expect(sellerProbe(screen, { ...sellBase, vsRival: 'yield' }, sellBoard)).toBe(21);
    expect(sellerProbe(screen, { ...sellBase, vsRival: 'undercut1' }, sellBoard)).toBeLessThan(20);
  });

  it('T-AC-8 · AM-21: a walkAway edit bounds the line trade too, on the board price; with the draft\'s walkAway the line is today\'s', () => {
    // Smithore with the export ship in port: each further unit the ship takes pays a little less.
    const seed = 3;
    const screen = statusScreens(
      auctionTable(seed, (state) => {
        arrange(state);
        state.players[2]!.stock.smithore = 40;
        state.ship = { arrives: state.month, goods: ['smithore'], hold: { smithore: 200 }, bought: {} };
      }),
      seed,
    ).find((s) => s.auction!.good === 'smithore');
    expect(screen, 'smithore comes up').toBeDefined();
    const draft = ownDraft(seatsFor(seed)[2]!, screen!, 'smithore');
    expect(draft.role).toBe('seller');
    const today = runGood(screen!, seed, 2);
    const own = runGood(screen!, seed, 2, () => draft);
    expect(own.acts).toEqual(today.acts);
    const toShip = sold(today, 'ai2').filter((t) => t.buyer === SHIP_ID);
    expect(toShip.length, 'today it sells to the ship').toBeGreaterThan(2);
    // A walkAway two units down the ship's steps: it still walks to the line, but chooses only the units priced at or over it.
    const prices = toShip.map((t) => t.price);
    const walkAway = prices[2]!;
    const bounded = runGood(screen!, seed, 2, () => ({ ...draft, walkAway, start: walkAway }));
    const shipSales = sold(bounded, 'ai2').filter((t) => t.buyer === SHIP_ID);
    expect(shipSales.length).toBeGreaterThan(0);
    expect(shipSales.every((t) => t.price >= walkAway)).toBe(true);
    expect(bounded.lineUnits.length).toBeGreaterThan(0);
    expect(Math.max(...bounded.lineUnits)).toBeLessThanOrEqual(prices.filter((p) => p >= walkAway).length);
    expect(Math.max(...today.lineUnits), 'today it chose more at the line').toBeGreaterThan(Math.max(...bounded.lineUnits));
    // A bluffing seller walks to the far edge and sells nothing, to the ship neither.
    const bluff = runGood(screen!, seed, 2, () => ({ ...draft, bluff: true }));
    expect(sold(bluff, 'ai2')).toEqual([]);
    expect(bluff.lineUnits).toEqual([]);
  });

  it("T-AC-8 · AM-21: a buyer standing at the store's line with its walkAway under the store's ask buys nothing there", () => {
    const screen = foodScreen();
    const buyer = ownDraft(seatsFor(5)[1]!, screen, 'food');
    const ask = screen.auction!.storeSell;
    const had = screen.players[1]!.stock.food;
    // With a walkAway at the ask it chooses units at the line and buys them, as today's hand does: the line binds below.
    const at = lineProbe(screen, { ...buyer, walkAway: ask, start: ask });
    expect(at.acts.some((x) => x.includes('"type":"lineTrade"')), JSON.stringify(at.acts)).toBe(true);
    expect(at.food, JSON.stringify(at.acts)).toBeGreaterThan(had);
    const under = lineProbe(screen, { ...buyer, walkAway: ask - 1, start: ask - 1 });
    expect(under.acts.some((x) => x.includes('"type":"lineTrade"')), JSON.stringify(under.acts)).toBe(false);
    expect(under.acts.some((x) => x.includes('"type":"walk"')), 'it stands at the line').toBe(false);
    expect(under.food).toBe(had);
  });
});
