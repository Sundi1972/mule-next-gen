import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advanceGrant,
  advancePhase,
  AI_HANDS,
  commission,
  createGame,
  DEV_STEER,
  GOOD_CONFIG,
  GOODS,
  litPlot,
  MS_PER_SECOND,
  MULE,
  mulePriceFor,
  monthNeeds,
  monthlyDemand,
  observe,
  outfitCostFor,
  startAuction,
  stepAuction,
  WALK,
  type GameState,
  type Good,
  type Outfit,
  type Playbook,
  type Stock,
  type Tile,
  type Trade,
} from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { donationFor, standingOf } from '../src/colony-donate.js';
import { applyAction, arrive, playGame, type DevClock } from '../src/play.js';
import type { DraftPhase } from '../src/playbook/draft.js';
import { playbookSource } from '../src/playbook/source.js';
import type { PlanEdit } from '../src/playbook/validate.js';
import { AiSeat } from '../src/seat.js';
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

  it('B-AC-13: an adopted cashFloor keeps the seat\'s cash at or above it through development and the land auction', { timeout: 60_000 }, () => {
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

  describe('in development, under the tap-to-walk clock', () => {
    const DEV_FLOOR = 1_000;
    let steer = DEV_STEER.on;
    beforeEach(() => {
      steer = DEV_STEER.on;
      DEV_STEER.on = false;
    });
    afterEach(() => {
      DEV_STEER.on = steer;
    });

    /**
     * Month 1's development (seed 4) with ME's land cleared but one analysed plains plot by the store, and money one
     * credit short of DEV_FLOOR plus a MULE and the cheapest outfit: any MULE takes the cash under the floor. `before`
     * runs at planning, where a planning draft is adopted.
     */
    function underFloor(before: (seat: AiSeat, state: GameState) => void = () => {}) {
      const state = game(4);
      const seat = seatOf();
      before(seat, state);
      while (state.phase !== 'development') advancePhase(state);
      for (const t of state.tiles) if (t.owner === ME) t.owner = null;
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      const far = (t: Tile) => Math.abs(t.x - store.x) + Math.abs(t.y - store.y);
      const plot = state.tiles.filter((t) => t.terrain === 'plains' && t.owner === null).sort((a, b) => far(a) - far(b))[0]!;
      plot.owner = ME;
      const me = state.players.find((p) => p.id === ME)!;
      me.analysed.push(state.tiles.indexOf(plot));
      const cheapest = Math.min(...(Object.keys(MULE.outfitCost) as Outfit[]).map((o) => outfitCostFor(state, ME, o)));
      me.money = DEV_FLOOR + mulePriceFor(state, ME) + cheapest - 1;
      return { state, seat, plot, me };
    }

    /** ME's development turn as play.ts's loop runs it where the game walks; the least money it held on the way. */
    function developTurn(state: GameState, seat: AiSeat): number {
      const me = state.players.find((p) => p.id === ME)!;
      const clock: DevClock = { left: me.devSeconds, at: 'store' };
      let least = me.money;
      while (clock.left > 0 && !me.doneDeveloping) {
        arrive(state, ME, clock);
        seat.developTick(state, AI_HANDS.devTickMs, clock.left, (a) => applyAction(state, ME, a, clock), { at: clock.at!, busy: !!clock.busy });
        clock.left -= AI_HANDS.devTickMs / MS_PER_SECOND;
        least = Math.min(least, me.money);
      }
      return least;
    }

    it("B-AC-13: an adopted development route's MULE that would take the cash under the floor is dropped", () => {
      // Without the floor the adopted route's MULE is bought: the route breaks the floor.
      const open = underFloor();
      const route = adoptEdited(open.seat, open.state, 'development', []).development!.route;
      expect(route.some((s) => s.act === 'buyMule'), JSON.stringify(route)).toBe(true);
      expect(developTurn(open.state, open.seat)).toBeLessThan(DEV_FLOOR);
      expect(open.plot.outfit).not.toBeNull();

      const floored = underFloor();
      adoptEdited(floored.seat, floored.state, 'development', [edit('/strategy/cashFloor', DEV_FLOOR)]);
      expect(developTurn(floored.state, floored.seat)).toBeGreaterThanOrEqual(DEV_FLOOR);
      expect(floored.plot.outfit, 'no MULE installed').toBeNull();
    });

    it('B-AC-13: under an adopted cash floor the seat buys no MULE whose cost takes the cash under it, however much the MULE makes', () => {
      // Its own pick, on today's development path: the MULE's month of output would cover the floor, the cash does not.
      const open = underFloor();
      expect(developTurn(open.state, open.seat)).toBeLessThan(DEV_FLOOR);
      expect(open.plot.outfit).not.toBeNull();

      const floored = underFloor((seat, state) => adoptEdited(seat, state, 'planning', [edit('/strategy/cashFloor', DEV_FLOOR)]));
      expect(developTurn(floored.state, floored.seat)).toBeGreaterThanOrEqual(DEV_FLOOR);
      expect(floored.plot.outfit, 'no MULE installed').toBeNull();
    });
  });

  it('B-AC-13: a high adopted cash floor lists nothing more for sale in planning than today does', () => {
    const state = game(7);
    const seat = seatOf();
    // Two idle plots and a Smithore MULE to sell; money well over the reserve its needs call for, under the floor.
    const plains = state.tiles.filter((t) => t.terrain === 'plains' && !t.owner);
    for (const t of plains.slice(0, 2)) t.owner = ME;
    Object.assign(plains[2]!, { owner: ME, outfit: 'smithore' as Outfit });
    const me = state.players.find((p) => p.id === ME)!;
    me.money = 1_500;
    const today = seat.draft(state, 'planning').planning?.list ?? [];
    adoptEdited(seat, state, 'planning', [edit('/strategy/cashFloor', FLOOR)]);
    expect(cashReserve(observe(state, ME), seat.mind), 'the floor is the reserve').toBe(FLOOR);
    // The same month's draft again, as a re-plan or a writer's re-draft makes it: the floor raises no cash.
    expect(seat.draft(state, 'planning').planning?.list ?? []).toEqual(today);
  });
});

describe('an adopted playbook\'s land-grant press share (LandGrantPlay.pressShare)', () => {
  /**
   * How many plots into month 1's grant ME first claims on its own, nobody else claiming; with `press`, its adopted share.
   * Every good posted at its normal price (GOOD_CONFIG.refPrice), its normal and off-world price the same, and two months
   * of the colony's demand on the shelf: with or without the store's bands (C17) the store posts normal, so the plots
   * are valued at the same prices in both. Left to the bands, month 1 posts from the starting shelf (Water 25 not 7,
   * Electronics 880 not 622, Crystite 100 not 283), every plot is valued afresh and the claims move. Asserted: the store
   * still posts normal when the grant opens.
   */
  function firstClaim(press: { start: number; end: number } | null, seed = 7): number | null {
    const state = game(seed);
    const demand = monthlyDemand(state);
    const normal = Object.fromEntries(GOODS.map((g) => [g, GOOD_CONFIG[g].refPrice])) as Stock;
    const shelf = Object.fromEntries(GOODS.map((g) => [g, 2 * Math.ceil(demand[g])])) as Stock;
    Object.assign(state.store, { refPrice: { ...normal }, offWorld: { ...normal }, posted: { ...normal }, stock: shelf });
    const seat = seatOf();
    seat.planMonth(state);
    if (press) adoptEdited(seat, state, 'planning', [edit('/landGrant/pressShare', press)]);
    while (state.phase !== 'landGrant') advancePhase(state);
    expect(state.store.posted, 'the store posts normal').toEqual(normal);
    let step = 0;
    for (let lit = litPlot(state); lit; lit = advanceGrant(state)) {
      step++;
      if (seat.onLit(state) !== null) return step;
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

  it('B-AC-14: a share falling from start to end refuses an early plot it would take at end, and takes a later one it would refuse at start', () => {
    // Seed 25: at a steady 0.7 the seat claims early, at a steady 1 late; falling from 1 to 0.7, in between. (Seed 10
    // until the forecast stopped counting shortages after its own month, WS1 C: its plots' values moved.)
    const atEnd = firstClaim({ start: 0.7, end: 0.7 }, 25);
    const atStart = firstClaim({ start: 1, end: 1 }, 25);
    const falling = firstClaim({ start: 1, end: 0.7 }, 25);
    expect(atEnd).not.toBeNull();
    expect(atStart).not.toBeNull();
    expect(falling).not.toBeNull();
    expect(falling!, 'the early plot refused').toBeGreaterThan(atEnd!);
    expect(falling!, 'a later plot taken before the best one ahead').toBeLessThan(atStart!);
  });
});

describe('an adopted playbook\'s monopoly target (Strategy.monopolyTarget)', () => {
  /**
   * The most `seat` (as ME) bids for a unit of `good` in month 1's auction, every seat walking, with every rival short of
   * it and the store holding one: a good to corner. Each rival runs an Alloy works (for Smithore) or a farm (for Energy)
   * and holds none of the good.
   */
  function topBid(good: Good, seat: AiSeat): number {
    const state = game(1);
    while (state.phase !== 'auction') advancePhase(state);
    const rivals = PLAYERS.filter((id) => id !== ME);
    const plains = state.tiles.filter((t) => t.terrain === 'plains' && !t.owner);
    rivals.forEach((id, i) => Object.assign(plains[i]!, { owner: id, outfit: good === 'smithore' ? 'alloy' : 'food' }));
    for (const p of state.players) p.stock[good] = 0;
    state.store.stock[good] = 1;
    startAuction(state, [good]);
    const seats = [seat, ...rivals.map((id) => seatOf(id))];
    let top = 0;
    for (let tick = 0; tick < 20_000 && state.auction?.good === good && state.auction.stage !== 'close' && state.auction.stage !== 'over'; tick++) {
      for (const s of seats) s.auctionTick(state, WALK.tickMs, (a) => applyAction(state, s.id, a));
      stepAuction(state, WALK.tickMs);
      top = Math.max(top, seat.debug().auction?.limit ?? 0);
    }
    return top;
  }

  /** A seat whose month-1 playbook, adopted, sets `target`. */
  function targeting(target: Good): AiSeat {
    const seat = seatOf();
    const state = game(1);
    while (state.phase !== 'auction') advancePhase(state);
    adoptEdited(seat, state, 'planning', [edit('/strategy/monopolyTarget', target)]);
    return seat;
  }

  it('B-AC-15: an adopted monopolyTarget corners that good and no other', () => {
    // Today the seat bids a cornering premium on both scarce goods; a seat that never corners bids less on each.
    const plain = seatOf();
    Object.assign(plain.mind, { persona: { ...plain.mind.persona, corner: 0 } });
    const today = { smithore: topBid('smithore', seatOf()), energy: topBid('energy', seatOf()) };
    expect(today.smithore).toBeGreaterThan(topBid('smithore', plain));
    expect(today.energy).toBeGreaterThan(topBid('energy', plain));

    // Targeting Smithore: it bids today's cornering price for Smithore, and only what a seat that never corners bids for Energy.
    expect(topBid('smithore', targeting('smithore'))).toBe(today.smithore);
    expect(topBid('energy', targeting('smithore'))).toBe(topBid('energy', plain));
    // And the other way about.
    expect(topBid('energy', targeting('energy'))).toBe(today.energy);
    expect(topBid('smithore', targeting('energy'))).toBe(topBid('smithore', plain));
  });
});

describe('the engine\'s own seats read none of the fields', () => {
  it('INV-fields-engine: a seat playing its own drafts, or adopting drafts with none of the fields edited (or only its kind), holds no adopted field', { timeout: 60_000 }, () => {
    let seats: readonly AiSeat[] = [];
    const held: string[] = [];
    // ai1 adopts its own draft at every draft point, unedited; ai2 with only its kind edited; the others play their own drafts.
    playGame(1, simSeats(4, 'tycoon', 1), {
      politics: false,
      maxMonths: 3,
      edits: (seat) => (seat.id === 'ai1' ? [] : seat.id === 'ai2' ? [edit('/strategy/kind', 'monopolist')] : null),
      onSeats: (s) => (seats = s),
      onPhase: (s) => {
        for (const seat of seats) if (seat.mind.adopted !== undefined) held.push(`${seat.id} m${s.month} ${s.phase}`);
      },
    });
    expect(held).toEqual([]);
  });

  it('INV-fields-engine: the gate refuses an edit that replaces the whole strategy, so no adopted field can come from one', () => {
    const state = game();
    const seat = seatOf();
    const draft = seat.draft(state, 'planning');
    const { playbook, rejected } = seat.validator()(state, seat.id, draft, [edit('/strategy', { ...draft.strategy, cashFloor: 1_777 })]);
    expect(rejected.map((r) => [r.path, r.why])).toEqual([['/strategy', 'no such field']]);
    seat.adopt(playbook);
    expect(seat.mind.adopted).toBeUndefined();
  });
});

describe('an adopted field holds for its own month only', () => {
  it("INV-fields-month: the upkeep's draft of next month reads none of this month's adopted fields", () => {
    const state = game(7);
    const seat = seatOf();
    adoptEdited(seat, state, 'planning', [
      edit('/strategy/cashFloor', 1_777),
      edit('/landGrant/pressShare', { start: 0, end: 0 }),
      edit('/strategy/monopolyTarget', 'smithore'),
    ]);
    while (state.phase !== 'upkeep') advancePhase(state);
    expect(state.month).toBe(1);
    // As the server asks at upkeep: next month's land draft (its brief's strategy and grant) and its development draft.
    const source = playbookSource([seat]);
    const next = () => ({ land: source.draft(state, ME).playbook, development: seat.draft(state, 'development', 2) });
    const drafted = next();
    expect(drafted.land.month).toBe(2);
    expect(drafted.land.strategy.cashFloor).not.toBe(1_777);
    // The same drafts with no field adopted at all.
    delete seat.mind.adopted;
    expect(drafted).toEqual(next());
  });

  it("INV-fields-month: next month's planning, its gift to the colony and its land decision, is a seat's that adopted no field", () => {
    // A politics table: two seats alike, one adopting its month-1 draft with a cash floor over its money, one unedited.
    const state = createGame({ seed: 7, players: PLAYERS.map((id) => ({ id, name: id, isAi: true })), politics: true });
    const floored = seatOf();
    const plain = seatOf();
    adoptEdited(floored, state, 'planning', [edit('/strategy/cashFloor', 2_000)]);
    adoptEdited(plain, state, 'planning', []);
    while (!(state.phase === 'planning' && state.month === 2)) advancePhase(state);
    // Month 2's planning, a commissioned hospital still short of credits, and money between the reserve and the floor.
    if (state.politics) state.politics = { ...state.politics, governor: 'ai1', election: null };
    commission(state, 'ai1', 'hospital');
    state.players.find((p) => p.id === ME)!.money = 1_500;
    const obs = observe(state, ME);
    const gift = donationFor(obs, floored.mind, standingOf(obs, ME));
    expect(gift, 'it gives, as a seat with no floor gives').not.toBeNull();
    expect(gift).toEqual(donationFor(obs, plain.mind, standingOf(obs, ME)));
    // Its land decision for the month, made in planning and settled at the grant's first look: every plan's scores and the pick.
    for (const seat of [floored, plain]) seat.planMonth(state);
    // (Widened: the loop above narrowed the phase to planning.)
    while ((state.phase as GameState['phase']) !== 'landGrant') advancePhase(state);
    for (const seat of [floored, plain]) seat.passesGrant(state);
    const land = (seat: AiSeat) => seat.brain.log.filter((r) => r.kind === 'land');
    expect(land(floored)).toHaveLength(1);
    expect(land(floored)).toEqual(land(plain));
  });
});
