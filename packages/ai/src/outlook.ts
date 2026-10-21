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
  STRATEGIST,
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

const BEFORE_PRODUCTION = new Set(['planning', 'landGrant', 'development']);

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
    lastShortages = sim.history.at(-2)?.shortages ?? [];
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
  let future: Stock | null = null;
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
      return future[good] * (extra === 0 ? 1 : o.price(good, extra) / base);
    },
  };
  return o;
}

/**
 * Plays the status quo forward on a copy: nobody claims, builds or trades;
 * plots produce, everyone eats, the store builds MULEs and posts prices.
 * Returns the prices it posts at the last auction reached.
 */
function rollForward(stage: GameState, months: number): Stock {
  const sim = cloneForSim(stage);
  const target = Math.min(sim.month + months, endMonth(sim));
  let prices: Stock = { ...sim.store.posted };
  for (let guard = 0; guard < months * 8 && sim.phase !== 'gameOver'; guard++) {
    advancePhase(sim);
    if (sim.phase === 'auction') {
      prices = { ...sim.store.posted };
      if (sim.month >= target) break;
    }
  }
  return prices;
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
