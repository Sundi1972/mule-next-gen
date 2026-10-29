import {
  advancePhase,
  cloneForSim,
  endAuction,
  exportDemand,
  GAME,
  isGameOver,
  monthlyDemand,
  nextPostedPrice,
  runProduction,
  runUpkeep,
  emptyStock,
  GOODS,
  MULE,
  PRICE,
  STRATEGIST,
  UPKEEP,
  type GameState,
  type Good,
  type Stock,
} from '@mule/engine';

/**
 * The strategist's light look-ahead: where prices will stand at the next
 * auction, from the engine's own formulas. It plays the rest of the month on
 * a copy of what the seat can see, with nobody trading or developing any
 * more: this month's production (Energy first, the Energy rule, factories,
 * pollution), and from the auction on also upkeep (eating, spoilage, the
 * depot limit, the ship) and next month's production. Then it asks the
 * store's own pricing what it would post, with or without a few more units.
 * No sampling and no search: one rollout of the status quo.
 */
export interface Outlook {
  /** The copy at the moment the store posts the prices this outlook is about. */
  stage: GameState;
  /** True when the game ends first: held goods then count in the score at today's posted price. */
  final: boolean;
  /** What the seat's plots make in the rollout's production. */
  made: Stock;
  /** The posted price of a good at that auction, with `extra` more units in the colony (negative for fewer). */
  price(good: Good, extra?: number): number;
  /**
   * The posted price a few months later (STRATEGIST.outlookMonths), if
   * nobody builds or trades: a shortage building up shows here first. Scaled
   * by the same proportion as `price` for `extra` units.
   */
  later(good: Good, extra?: number): number;
}

const BEFORE_PRODUCTION = new Set(['planning', 'landGrant', 'landAuction', 'development']);

export function outlook(obs: GameState, me: string, options: { lookAhead: boolean; apply?: (sim: GameState) => void; months?: number }): Outlook {
  const months = options.months ?? STRATEGIST.outlookMonths;
  const sim = cloneForSim(obs);
  options.apply?.(sim);
  const flat = (): Outlook => ({ stage: sim, final: obs.month >= endMonth(obs), made: emptyStock(), price: (good) => obs.store.posted[good], later: (good) => obs.store.posted[good] });
  if (!options.lookAhead) return flat();

  let made = emptyStock();
  let lastShortages: readonly Good[];
  if (BEFORE_PRODUCTION.has(sim.phase)) {
    lastShortages = sim.history.at(-1)?.shortages ?? [];
    made = produce(sim, me);
  } else if (sim.phase === 'production') {
    lastShortages = sim.history.at(-2)?.shortages ?? []; // literal-ok: last month's report, a position in the history
  } else {
    // At or after the auction: finish the month, then look at next month's.
    let shortages: readonly Good[] = sim.history.at(-1)?.shortages ?? [];
    if (sim.phase === 'auction') {
      endAuction(sim);
      sim.auction = null;
      shortages = runUpkeep(sim).shortages;
    }
    if (isGameOver(sim)) return { ...flat(), final: true };
    sim.month++;
    lastShortages = shortages;
    made = produce(sim, me);
  }

  const demand = monthlyDemand(sim);
  const off = exportDemand(sim);
  const seat = sim.players.find((p) => p.id === me)!;
  const cache = new Map<string, number>();
  let future: Future | null = null;
  const o: Outlook = {
    stage: sim,
    final: false,
    made,
    price(good, extra = 0) {
      const key = `${good}:${Math.round(extra)}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      seat.stock[good] += extra;
      const p = nextPostedPrice(sim, good, demand, lastShortages, off);
      seat.stock[good] -= extra;
      cache.set(key, p);
      return p;
    },
    later(good, extra = 0) {
      future ??= rollForward(sim, months);
      const base = Math.max(1, o.price(good));
      return future.prices[good] * (extra === 0 ? 1 : o.price(good, extra) / base);
    },
  };
  return o;
}

interface Future {
  prices: Stock;
}

/**
 * Plays the status quo forward on a copy: nobody claims, builds or trades,
 * except that the seats buy the MULEs they claim land for, so the corral
 * drains as it does in play; plots produce, everyone eats, the store builds
 * MULEs and posts prices. Returns the prices posted `months` on, raised
 * where the rollout (run on to the horizon) shows a shortage the price
 * hasn't caught up with yet: Food or Water colonists went short of count at
 * what colonists would pay, and Smithore, when the corral can't build its
 * monthly target, at its price at the horizon.
 */
function rollForward(stage: GameState, months: number): Future {
  const sim = cloneForSim(stage);
  const from = sim.history.length;
  const asked = Math.min(sim.month + months, endMonth(sim));
  const target = Math.min(sim.month + Math.max(months, STRATEGIST.horizon), endMonth(sim));
  const muleTarget = sim.players.length * GAME.claimsPerGrant + MULE.spareInCorral;
  let prices: Stock = { ...sim.store.posted };
  let last: Stock = prices;
  let corralShort = false;
  // literal-ok: a month has seven phases, so eight a month bounds the loop: a guard, not balance
  for (let guard = 0; guard < (target - sim.month + 1) * 8 && sim.phase !== 'gameOver'; guard++) {
    advancePhase(sim);
    if (sim.phase === 'production') sim.store.mules = Math.max(0, sim.store.mules - sim.players.length * GAME.claimsPerGrant);
    if (sim.phase === 'planning' && sim.store.mules < muleTarget) corralShort = true;
    if (sim.phase === 'auction') {
      last = { ...sim.store.posted };
      if (sim.month <= asked) prices = last;
      if (sim.month >= target) break;
    }
  }
  prices = { ...prices };
  for (const good of new Set(sim.history.slice(Math.max(0, from - 1)).flatMap((h) => h.shortages))) {
    prices[good] = Math.max(prices[good], (UPKEEP.colonistBudget[good] ?? 0) / (1 + PRICE.storeSpread));
  }
  if (corralShort) prices.smithore = Math.max(prices.smithore, last.smithore);
  return { prices };
}

function produce(sim: GameState, me: string): Stock {
  for (const p of sim.players) p.carriedMule = null;
  const { produced } = runProduction(sim);
  return produced[me] ?? emptyStock();
}

/** The last month that will be played, as far as anyone can tell today. */
export function endMonth(state: GameState): number {
  return state.landRanOutMonth === null ? state.maxMonths : Math.min(state.maxMonths, state.landRanOutMonth + GAME.landRushMonths);
}

/** Productions still to come, counting this month's if it hasn't run yet. */
export function productionsLeft(state: GameState): number {
  return Math.max(0, endMonth(state) - state.month + (BEFORE_PRODUCTION.has(state.phase) ? 1 : 0));
}

/** Every good's price in an outlook, without extra units. */
export function outlookPrices(o: Outlook): Stock {
  const s = emptyStock();
  for (const g of GOODS) s[g] = o.price(g);
  return s;
}
