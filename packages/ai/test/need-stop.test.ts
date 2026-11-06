import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  createRng,
  GOOD_CONFIG,
  monthNeeds,
  needsOf,
  startAuction,
  stepAuction,
  UPKEEP,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type GoodPlay,
  type Trade,
} from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { AuctionHand } from '../src/hands/auction.js';
import { applyAction } from '../src/play.js';
import { draftGoodPlaybook } from '../src/playbook/draft.js';
import { AiSeat } from '../src/seat.js';

/**
 * RULE-4 (spec §10, AM-2 item 4): a seller stops at the Food it must hold, and sells below it only after holding ▼ for
 * WALK.shortHoldMs. The AI hand holds ▼ there only when its own keep floor is below that need: selling into shortage is
 * a choice its plan made, never an accident of the walk. Month 1's Food auction, played through the engine: ai0 (the
 * trader) holds what keeps it whole and 3 more, and ai1 holds no Food and has money, so it bids for ai0's.
 */

const SEATS: { persona: AiPersonaId; level: AiLevelId }[] = [
  { persona: 'trader', level: 'trader' },
  { persona: 'cautious', level: 'tycoon' },
  { persona: 'aggressive', level: 'rookie' },
  { persona: 'saboteur', level: 'tycoon' },
];
const SEED = 1;
const ME = 'ai0';
const RIVAL = 'ai1';
const seatsFor = () => SEATS.map((s, i) => new AiSeat({ id: `ai${i}`, name: `AI ${i + 1}`, ...s, seed: SEED * 10 + i }));

/** Upkeep eats the household's Food, half of the rest spoils, and next development is hungry under the household's Food. */
const wholeFood = (state: GameState, id: string) => needsOf(state, id).food + Math.ceil(needsOf(state, id).food / (1 - GOOD_CONFIG.food.spoilage));

/** The Food status screen: ai0 and ai1 on three Energy plots each, ai0 holding 3 over what keeps it whole, ai1 none. */
function foodScreen(): GameState {
  const state = createGame({ seed: SEED, players: SEATS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock.food = Math.ceil(state.colonists / UPKEEP.colonistsPerUnit) + 40;
  for (const p of state.players) p.stock.food = Math.max(monthNeeds(state, p.id).food, wholeFood(state, p.id));
  for (const id of [ME, RIVAL]) {
    const free = state.tiles.filter((x) => x.terrain === 'plains' && !x.owner);
    for (let i = 0; i < 3; i++) Object.assign(free[i]!, { owner: id, outfit: 'energy' });
    const p = state.players.find((x) => x.id === id)!;
    for (const g of ['energy', 'water'] as const) p.stock[g] = 2 * (monthNeeds(state, id)[g] + 2);
    p.stock.food = id === ME ? wholeFood(state, id) + 3 : 0;
    p.money = 3_000;
  }
  startAuction(state, ['food']);
  return state;
}

interface Run {
  /** The Food it must hold: the status row's need. */
  need: number;
  /** Units it means to end with: its keep floor, as the hand settled it. */
  floor: number | null;
  /** Board ms when it was first stopped at its need; null if never. */
  stoppedAt: number | null;
  /** Its walk intents after the stop, with the board ms. */
  after: { at: number; act: AiAction }[];
  trades: Trade[];
  /** Board ms of its first sale below its need; null if none. */
  shortAt: number | null;
  /** Its Food after the good closed. */
  left: number;
}

/** Plays the Food good to its close; ai0 by `hand` when given (the playbook path), else by its own seat. */
function play(state: GameState, hand?: (seat: AiSeat) => AuctionHand): Run {
  const seats = seatsFor();
  const me = seats[0]!;
  const mine = hand?.(me);
  const need = state.auction!.status.find((r) => r.id === ME)!.need;
  const run: Run = { need, floor: null, stoppedAt: null, after: [], trades: [], shortAt: null, left: 0 };
  const food = () => state.players.find((p) => p.id === ME)!.stock.food;
  for (let tick = 0; tick < 2_000; tick++) {
    const a = state.auction!;
    if (a.good !== 'food' || a.stage === 'close' || a.stage === 'over') break;
    for (const s of seats) {
      const act = (x: AiAction) => {
        if (s === me && run.stoppedAt !== null && x.type === 'walk') run.after.push({ at: a.elapsed, act: x });
        return applyAction(state, s.id, x);
      };
      if (s === me && mine) mine.tick(state, WALK.tickMs, act);
      else s.auctionTick(state, WALK.tickMs, act);
    }
    run.floor ??= (mine ? mine.debug() : me.debug().auction)?.goal ?? null;
    run.trades.push(...stepAuction(state, WALK.tickMs));
    if (run.shortAt === null && food() < need) run.shortAt = a.elapsed;
    if (run.stoppedAt === null && a.walkers.find((w) => w.id === ME)?.held) run.stoppedAt = a.elapsed;
  }
  run.left = food();
  return run;
}

const soldBy = (run: Run) => run.trades.filter((t) => t.seller === ME).reduce((n, t) => n + t.quantity, 0);

describe('RULE-4 AI: a held AI seller presses ▼ again only when it chose to sell into shortage', () => {
  it('RULE-4 AI: a held AI seller whose keep floor is at or above its need never presses ▼ again, and sells nothing below its need over the rest of the walk', () => {
    const state = foodScreen();
    const need = state.auction!.status.find((r) => r.id === ME)!.need;
    // Its own draft for the good, holding exactly its need: the playbook path's keep floor is the play's hold.
    const own = (seat: AiSeat) => draftGoodPlaybook({ state, seat: ME, mind: seat.mind, seed: seat.options.seed }, 'food').auction!.food!;
    const hand = (seat: AiSeat) => {
      const part: GoodPlay = { ...own(seat), role: 'seller', hold: need, bluff: false };
      return new AuctionHand(seat.brain, createRng((seat.options.seed ^ 0x85ebca6b) >>> 0), () => ({ play: structuredClone(part), mind: seat.mind })); // literal-ok: AiSeat's salt for the auction hand's rng
    };

    const run = play(state, hand);

    expect(run.floor, 'the premise: its keep floor is its need').toBe(need);
    expect(run.stoppedAt, 'the premise: it sold down to its need and was stopped there').not.toBeNull();
    expect(soldBy(run), 'the premise: it sold its surplus first').toBeGreaterThan(0);
    expect(run.after.filter((x) => x.act.type === 'walk' && x.act.dir === -1), 'it never pressed ▼ after the stop').toEqual([]);
    expect(run.left, `it ends holding its need of ${need}`).toBeGreaterThanOrEqual(need);
  });

  it('RULE-4 AI: a held AI seller whose keep floor is below its need holds ▼ and sells on, down to its floor', () => {
    const state = foodScreen();

    const run = play(state);

    expect(run.floor, 'the premise: its keep floor is below its need').not.toBeNull();
    expect(run.floor!, 'the premise: its keep floor is below its need').toBeLessThan(run.need);
    expect(run.stoppedAt, 'it was stopped at its need').not.toBeNull();
    expect(run.shortAt, 'it sold into shortage').not.toBeNull();
    expect(run.shortAt! - run.stoppedAt!, 'only after a full hold of ▼').toBeGreaterThanOrEqual(WALK.shortHoldMs);
    expect(run.left, `it sold down to its floor of ${run.floor}`).toBe(run.floor);
  });
});
