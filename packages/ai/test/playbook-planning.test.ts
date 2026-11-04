import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, list, observe, storePaysFor, unlist, type GameState, type Listing, type Outfit, type Playbook, type PlanningPlay } from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import type { Decider } from '../src/decider.js';
import { simSeats } from '../src/lineup.js';
import { applyAction, playGame } from '../src/play.js';
import { draftPlaybook } from '../src/playbook/index.js';
import { AiSeat, type AiSeatOptions } from '../src/seat.js';
import { sellWanted } from '../src/strategist.js';

// Seed 11's map: plot 10 is desert, 1 to 5 and 13 plains, 56 mountains.
const DESERT = 10;
const MOUNTAIN = 56;
const FREE = 4;
const FREE_2 = 5;

/** Month 1's planning on seed 11, ai0 holding `money` and the given plots: an outfit puts a MULE on it, null leaves it idle. */
function holding(money: number, plots: [number, Outfit | null][]): GameState {
  const state = createGame({ seed: 11, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  for (const [index, outfit] of plots) Object.assign(state.tiles[index]!, { owner: 'ai0', outfit });
  state.players[0]!.money = money;
  return state;
}

/** Short of cash: a trader's reserve is 60 cr with nothing short, and it holds 40, an idle plot and a Smithore MULE. */
const short = () => holding(40, [[DESERT, null], [MOUNTAIN, 'smithore']]);

const seatOf = (options: Partial<AiSeatOptions> = {}) => new AiSeat({ id: 'ai0', name: 'AI 1', persona: 'trader', level: 'trader', seed: 100, ...options });

/** The seat's planning act, as play.ts's: the engine's own checks, every call counted. */
function counted(state: GameState) {
  const calls: AiAction[] = [];
  const act = (a: AiAction) => {
    calls.push(a);
    return applyAction(state, 'ai0', a);
  };
  return { act, calls };
}

const listingsOf = (state: GameState, seller = 'ai0') => state.listings.filter((l) => l.seller === seller);
const xy = (state: GameState, plot: number) => ({ x: state.tiles[plot]!.x, y: state.tiles[plot]!.y });

/** The listing lots.ts makes for an entry of planning.list. */
function listingFor(state: GameState, e: NonNullable<PlanningPlay['list']>[number]): Listing {
  const { x, y } = xy(state, e.plot);
  const outfit = state.tiles[e.plot]!.outfit;
  return {
    id: `${e.item}-${x}-${y}`,
    seller: 'ai0',
    item: e.item === 'plot' ? { kind: 'plot', x, y } : { kind: 'mule', x, y, outfit: outfit! },
    minimum: e.minimum,
    unsold: e.unsold,
    storePays: storePaysFor(state, e.item),
  };
}

const listAction = (state: GameState, e: NonNullable<PlanningPlay['list']>[number]): AiAction => ({ type: 'list', item: { kind: e.item, ...xy(state, e.plot) }, minimum: e.minimum, unsold: e.unsold });

/** A playbook for this month, as WS2 would adopt one, carrying `planning`. */
function adopted(state: GameState, seat: AiSeat, planning: PlanningPlay | undefined): Playbook {
  const { planning: _, ...pb } = draftPlaybook({ state, seat: 'ai0', mind: seat.mind, seed: 1, phase: 'planning' });
  return { ...pb, ...(planning ? { planning } : {}), by: 'llm' };
}

/** Fills the land auction with ai1's and ai2's plots, so the next listing is refused. */
function fillAuction(state: GameState): void {
  for (const [seller, plots] of [['ai1', [1, 2]], ['ai2', [3, 13]]] as const) {
    for (const plot of plots) {
      Object.assign(state.tiles[plot]!, { owner: seller, outfit: null });
      list(state, seller, { item: { kind: 'plot', ...xy(state, plot) }, minimum: 300, unsold: 'keep' });
    }
  }
}

const MULE_LOT = { item: 'mule' as const, plot: MOUNTAIN, minimum: 900, unsold: 'store' as const };

describe('the seat plays its planning part (C4, RULE-13)', () => {
  it('T-AC-10: RULE-13, a refusal is skipped and logged, never retried; a later adopt reconciles the listings', () => {
    const state = short();
    fillAuction(state);
    const [plotLot] = sellWanted(observe(state, 'ai0'), seatOf().mind);
    expect(plotLot).toMatchObject({ item: 'plot', plot: DESERT });
    const seat = seatOf();
    const { act, calls } = counted(state);

    seat.planMonth(state, act);
    // The auction is full: the listing is refused, logged, and nothing else is tried.
    expect(listingsOf(state)).toEqual([]);
    expect(calls).toEqual([listAction(state, plotLot!)]);
    expect(seat.planningLog()).toEqual([{ action: listAction(state, plotLot!), ok: false }]);

    // An adopt with the same list: the refused listing is not tried again.
    seat.adopt(adopted(state, seat, { list: [plotLot!] }));
    expect(calls).toHaveLength(1);

    // A slot frees up and a later adopt brings a new list: it plays, and the auction holds what that list says.
    unlist(state, 'ai2', listingsOf(state, 'ai2')[0]!.id);
    seat.adopt(adopted(state, seat, { list: [MULE_LOT] }));
    expect(listingsOf(state)).toEqual([listingFor(state, MULE_LOT)]);
    expect(calls).toHaveLength(2);
    expect(seat.planningLog().at(-1)).toEqual({ action: listAction(state, MULE_LOT), ok: true });
  });

  it('T-AC-10: RULE-13 step 2, it unlists what the list lacks and lists what is not yet listed; the seat needs no playbook listener', () => {
    const state = short();
    const [plotLot] = sellWanted(observe(state, 'ai0'), seatOf().mind);
    // A listing the seat made earlier that its list does not hold.
    list(state, 'ai0', { item: { kind: 'mule', ...xy(state, MOUNTAIN) }, minimum: 999, unsold: 'keep' });
    const seat = seatOf();
    const { act } = counted(state);

    seat.planMonth(state, act);
    expect(listingsOf(state)).toEqual([listingFor(state, plotLot!)]);
    expect(seat.planningLog()).toEqual([
      { action: { type: 'unlist', id: `mule-${xy(state, MOUNTAIN).x}-${xy(state, MOUNTAIN).y}` }, ok: true },
      { action: listAction(state, plotLot!), ok: true },
    ]);

    // Already listed as its list says: nothing to do.
    const again = seatOf();
    const second = counted(state);
    again.planMonth(state, second.act);
    expect(second.calls).toEqual([]);
    expect(listingsOf(state)).toEqual([listingFor(state, plotLot!)]);

    // A seat that writes its playbooks lists the same, and writes the list it played.
    const written: Playbook[] = [];
    const other = short();
    seatOf({ onPlaybook: (pb) => written.push(pb) }).planMonth(other, counted(other).act);
    expect(listingsOf(other)).toEqual([listingFor(other, plotLot!)]);
    expect(written.map((pb) => pb.planning)).toEqual([{ list: [plotLot] }]);
  });

  it('T-AC-10: RULE-13 step 4, an adopt later in planning re-runs step 2; once planning has ended the listings stand', () => {
    const state = short();
    const [plotLot] = sellWanted(observe(state, 'ai0'), seatOf().mind);
    const seat = seatOf();
    const { act, calls } = counted(state);
    seat.planMonth(state, act);
    expect(listingsOf(state)).toEqual([listingFor(state, plotLot!)]);

    // An adopted playbook with no planning part leaves the seat's own list in play: nothing changes.
    seat.adopt(adopted(state, seat, undefined));
    expect(calls).toHaveLength(1);

    seat.adopt(adopted(state, seat, { list: [MULE_LOT] }));
    expect(listingsOf(state)).toEqual([listingFor(state, MULE_LOT)]);
    expect(calls.slice(1)).toEqual([{ type: 'unlist', id: listingFor(state, plotLot!).id }, listAction(state, MULE_LOT)]);

    // Planning ends before the next adopt: the listings stand and the seat acts no more.
    advancePhase(state);
    expect(state.phase).toBe('landGrant');
    seat.adopt(adopted(state, seat, { list: [] }));
    expect(listingsOf(state)).toEqual([listingFor(state, MULE_LOT)]);
    expect(calls).toHaveLength(3);
  });

  it('T-AC-10: RULE-13 step 1, the drone flies once, only when none is ordered', () => {
    const rich = holding(1_000, [[DESERT, null]]);
    const seat = seatOf();
    seat.adopt(adopted(rich, seat, { drone: [FREE, FREE_2] }));
    const { act, calls } = counted(rich);
    seat.planMonth(rich, act);
    expect(calls).toEqual([{ type: 'drone', plots: [xy(rich, FREE), xy(rich, FREE_2)] }]);
    expect(rich.players[0]!.droneOrder).toEqual([FREE, FREE_2]);
    // A later adopt re-runs the listings only: no second drone.
    seat.adopt(adopted(rich, seat, { drone: [FREE_2] }));
    expect(calls).toHaveLength(1);

    const ordered = holding(1_000, [[DESERT, null]]);
    ordered.players[0]!.droneOrder = [FREE_2];
    const busy = seatOf();
    busy.adopt(adopted(ordered, busy, { drone: [FREE] }));
    const none = counted(ordered);
    busy.planMonth(ordered, none.act);
    expect(none.calls).toEqual([]);
  });

  it("T-AC-10 (negative): a seat on today's path, or not short, never lists; a Smart seat plays an adopted list", () => {
    for (const options of [{ playbook: false }, { decider: { name: 'first', decide: (o) => ({ optionId: o[0]!.id, line: null, by: 'llm' }) } as Decider }]) {
      const state = short();
      const { act, calls } = counted(state);
      seatOf(options).planMonth(state, act);
      expect(calls, JSON.stringify(Object.keys(options))).toEqual([]);
      expect(listingsOf(state)).toEqual([]);
    }
    const rich = holding(400, [[DESERT, null], [MOUNTAIN, 'smithore']]);
    const { act, calls } = counted(rich);
    seatOf().planMonth(rich, act);
    expect(calls).toEqual([]);

    // RULE-6 row 2: a playbook adopted for the month plays for a Smart seat too, and an adopt in planning lists it.
    const state = short();
    const smart = seatOf({ decider: { name: 'first', decide: (o) => ({ optionId: o[0]!.id, line: null, by: 'llm' }) } });
    smart.planMonth(state, counted(state).act);
    smart.adopt(adopted(state, smart, { list: [MULE_LOT] }));
    expect(listingsOf(state)).toEqual([listingFor(state, MULE_LOT)]);
  });

  it("T-AC-10: the sim's planning loop hands each seat its act, so a seat short of cash lists, unsold to the store", () => {
    const listed: Listing[] = [];
    for (const seed of [1, 2]) {
      playGame(seed, simSeats(4, 'trader', seed), {
        maxMonths: 4,
        onPhase: (state) => {
          if (state.phase === 'planning') listed.push(...state.listings.filter((l) => l.seller.startsWith('ai')));
        },
      });
    }
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((l) => l.unsold === 'store')).toBe(true);
  });
});
