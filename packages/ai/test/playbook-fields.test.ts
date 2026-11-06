import { describe, expect, it } from 'vitest';
import {
  advanceGrant,
  advancePhase,
  createGame,
  litPlot,
  monthNeeds,
  observe,
  startAuction,
  stepAuction,
  tileIndex,
  WALK,
  type GameState,
  type Good,
  type Outfit,
  type Playbook,
  type Trade,
} from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { applyAction, playGame } from '../src/play.js';
import type { DraftPhase } from '../src/playbook/draft.js';
import type { PlanEdit } from '../src/playbook/validate.js';
import { AiSeat } from '../src/seat.js';
import { goodPlan } from '../src/strategist.js';
import { cashReserve } from '../src/value.js';

/** Three fields an adopted playbook sets by Claude's edit, now read by the hands: cashFloor, pressShare, monopolyTarget. */

const ME = 'ai0';
const PLAYERS = ['ai0', 'ai1', 'ai2', 'ai3'];

const game = (seed = 7) => createGame({ seed, players: PLAYERS.map((id) => ({ id, name: id, isAi: true })) });
const seatOf = (id = ME) => new AiSeat({ id, name: id, persona: 'trader', level: 'tycoon', seed: 11 + PLAYERS.indexOf(id) });

/** The seat's own draft for `phase`, with Claude's `edits` passed through its gate, adopted. */
function adoptEdited(seat: AiSeat, state: GameState, phase: DraftPhase, edits: PlanEdit[]): Playbook {
  const { playbook, rejected } = seat.validator()(state, seat.id, seat.draft(state, phase), edits);
  expect(rejected).toEqual([]);
  seat.adopt(playbook);
  return playbook;
}

const edit = (path: string, to: unknown): PlanEdit => ({ path, to, reason: 'Claude says so.' });

describe('an adopted playbook\'s cash floor (Strategy.cashFloor)', () => {
  const FLOOR = 2_000;

  /** Four months of a sim table; with `floor`, ME's every draft point adopts its draft with that cash floor. */
  function moneyByPhase(floor: number | null) {
    const rows: { month: number; phase: string; before: number; after: number }[] = [];
    let before = 0;
    playGame(1, simSeats(4, 'tycoon', 1), {
      politics: false,
      maxMonths: 4,
      edits: (seat) => (floor !== null && seat.id === ME ? [edit('/strategy/cashFloor', floor)] : null),
      onPhase: (s) => {
        const after = s.players.find((p) => p.id === ME)!.money;
        rows.push({ month: s.month, phase: s.phase, before, after });
        before = after;
      },
    });
    // A phase spends under the floor when it ends below both the floor and the cash it started with.
    return rows.filter((r) => (r.phase === 'development' || r.phase === 'landAuction') && r.after < Math.min(FLOOR, r.before));
  }

  it('B-AC-13: an adopted cashFloor keeps the seat\'s cash at or above it through development and the land auction', () => {
    expect(moneyByPhase(null).length, 'without the floor the seat spends below it').toBeGreaterThan(0);
    expect(moneyByPhase(FLOOR)).toEqual([]);
  });

  it('B-AC-13: under an adopted cashFloor the seat still buys the Food it needs, below the floor', () => {
    const state = game(1);
    while (state.phase !== 'auction') advancePhase(state);
    const seats = PLAYERS.map((id) => seatOf(id));
    adoptEdited(seats[0]!, state, 'planning', [edit('/strategy/cashFloor', FLOOR)]);
    // Three Energy plots and no Food; everyone else whole; the store sells plenty.
    const free = state.tiles.filter((t) => t.terrain === 'plains' && !t.owner);
    for (const t of free.slice(0, 3)) Object.assign(t, { owner: ME, outfit: 'energy' as Outfit });
    for (const p of state.players) p.stock.food = p.id === ME ? 0 : 2 * monthNeeds(state, p.id).food + 4;
    const me = state.players.find((p) => p.id === ME)!;
    me.stock.energy = 2 * monthNeeds(state, ME).energy + 4;
    me.money = 500;
    state.store.stock.food = 80;
    expect(cashReserve(observe(state, ME), seats[0]!.mind), 'the floor is the reserve').toBe(FLOOR);
    startAuction(state, ['food']);
    const trades: Trade[] = [];
    for (let tick = 0; tick < 20_000 && state.auction?.good === 'food' && state.auction.stage !== 'close' && state.auction.stage !== 'over'; tick++) {
      for (const s of seats) s.auctionTick(state, WALK.tickMs, (a) => applyAction(state, s.id, a));
      trades.push(...stepAuction(state, WALK.tickMs));
    }
    expect(trades.filter((t) => t.buyer === ME).reduce((n, t) => n + t.quantity, 0)).toBeGreaterThan(0);
    expect(me.money).toBeLessThan(FLOOR);
  });
});

describe('an adopted playbook\'s land-grant press share (LandGrantPlay.pressShare)', () => {
  /** The first lit plot ME claims on its own in month 1's grant, nobody else claiming; with `press`, its adopted share. */
  function firstClaim(press: { start: number; end: number } | null): number | null {
    const state = game();
    const seat = seatOf();
    seat.planMonth(state);
    if (press) adoptEdited(seat, state, 'planning', [edit('/landGrant/pressShare', press)]);
    while (state.phase !== 'landGrant') advancePhase(state);
    for (let lit = litPlot(state); lit; lit = advanceGrant(state)) {
      if (seat.onLit(state) !== null) return tileIndex(state.width, lit.x, lit.y);
    }
    return null;
  }

  it('B-AC-14: an adopted pressShare changes which lit plot the grant claims', () => {
    const today = firstClaim(null);
    const choosy = firstClaim({ start: 1, end: 1 });
    const eager = firstClaim({ start: 0, end: 0 });
    expect(eager).not.toBeNull();
    expect(choosy).not.toBeNull();
    // Taking any plot it ranks makes it claim no later than today; holding out for the best ahead, no earlier.
    expect(eager!).toBeLessThanOrEqual(today!);
    expect(choosy!).toBeGreaterThanOrEqual(today!);
    expect(eager).not.toBe(choosy);
  });
});

describe('an adopted playbook\'s monopoly target (Strategy.monopolyTarget)', () => {
  /** Month 1's auction with `good` up and every rival short of it, which the store can't cover: a good to corner. */
  function scarce(good: Good, seat: AiSeat): number {
    const state = game(1);
    while (state.phase !== 'auction') advancePhase(state);
    const rivals = PLAYERS.filter((id) => id !== ME);
    // Each rival runs an Alloy works (for Smithore) or holds plots burning Energy, and holds none of the good.
    const plains = state.tiles.filter((t) => t.terrain === 'plains' && !t.owner);
    rivals.forEach((id, i) => Object.assign(plains[i]!, { owner: id, outfit: good === 'smithore' ? 'alloy' : 'food' }));
    for (const p of state.players) p.stock[good] = 0;
    // One unit on the shelf, so the good is auctioned at all; six short.
    state.store.stock[good] = 1;
    startAuction(state, [good]);
    return goodPlan(observe(state, ME), seat.mind, good).corner.units;
  }

  it('B-AC-15: an adopted monopolyTarget corners that good and no other', () => {
    const today = seatOf();
    expect(scarce('smithore', today), 'today: scarce Smithore is cornered').toBeGreaterThan(0);
    expect(scarce('energy', today), 'today: scarce Energy is cornered').toBeGreaterThan(0);

    const adopted = seatOf();
    const state = game(1);
    while (state.phase !== 'auction') advancePhase(state);
    adoptEdited(adopted, state, 'planning', [edit('/strategy/monopolyTarget', 'smithore')]);
    expect(scarce('smithore', adopted)).toBeGreaterThan(0);
    expect(scarce('energy', adopted)).toBe(0);
  });
});

describe('the engine\'s own seats read none of the fields', () => {
  it('INV-fields-engine: a seat playing its own drafts, or adopting drafts with none of the fields edited, holds no adopted field', () => {
    let seats: readonly AiSeat[] = [];
    const held: string[] = [];
    // ai1 adopts its own draft at every draft point, unedited; the others play their own drafts.
    playGame(1, simSeats(4, 'tycoon', 1), {
      politics: false,
      maxMonths: 3,
      edits: (seat) => (seat.id === 'ai1' ? [] : null),
      onSeats: (s) => (seats = s),
      onPhase: (s) => {
        for (const seat of seats) if (seat.mind.adopted !== undefined) held.push(`${seat.id} m${s.month} ${s.phase}`);
      },
    });
    expect(held).toEqual([]);
  });
});
