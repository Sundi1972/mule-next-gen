import { colonySupply, cover, monthlyDemand } from './economy.js';
import { expectedGround, tileIndex } from './map.js';
import { emptyStock } from './stock.js';
import { GOODS, type GameState, type Stock, type Tile } from './types.js';

/**
 * What one seat may know, shaped like a GameState so the engine's own
 * formulas run on it. AI players read the game only through this.
 *
 * Kept: everything a human in that seat sees on their phone or the board:
 * the map, owners, outfits and pollution; every player's money; the store's
 * prices, stock and MULEs; each good's cover (the market panel), the export
 * ship's wishlist once it is announced; the auction board and its status
 * screen; the colony's price history. The reference and off-world prices
 * count as public colony data (the federation's price list).
 *
 * Hidden and replaced:
 * - ground and traits of plots the seat hasn't analysed: the terrain's
 *   average rating and no traits (traits stay on its own plots, as on the phone);
 * - other players' stock: the colony's holdings that the market's cover
 *   implies, shared evenly among them, except the good on the auction's status
 *   screen, whose rows are public;
 * - other players' analyses, drone orders, MULE in tow, hunger and sickness;
 * - the seed, the land grant's coming order and the unannounced ship's
 *   wishlist, which would let a reader see the future;
 * - other players' rows in the history (what they had and made).
 */
export function observe(state: GameState, playerId: string): GameState {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error(`Unknown player ${playerId}`);
  const sim = cloneForSim(state);
  const analysed = new Set(me.analysed);

  sim.tiles = sim.tiles.map((t, i) => {
    if (t.terrain === 'store' || analysed.has(i)) return t;
    return { ...t, ground: expectedGround(t.terrain), traits: t.owner === playerId ? t.traits : [] };
  });

  // Other players' stock: what the public market panel implies, split evenly.
  const others = sim.players.filter((p) => p.id !== playerId);
  if (others.length > 0) {
    const demand = monthlyDemand(state);
    const held = emptyStock();
    for (const good of GOODS) {
      // The market panel shows cover; supply = cover x demand. Where demand is 0 the panel shows no cover, so nothing is implied.
      const c = cover(state, good, demand);
      const supply = Number.isFinite(c) ? colonySupply(state, good) : 0;
      const corral = good === 'smithore' ? state.store.mules : 0;
      held[good] = Math.max(0, supply - state.store.stock[good] - corral - me.stock[good]);
    }
    const status = state.auction?.stage !== 'over' && state.auction?.good ? state.auction : null;
    others.forEach((p, i) => {
      const stock = {} as Stock;
      for (const good of GOODS) {
        const share = Math.floor(held[good] / others.length) + (i < held[good] % others.length ? 1 : 0);
        stock[good] = share;
      }
      if (status) {
        const row = status.status.find((r) => r.id === p.id);
        if (row) stock[status.good!] = row.now;
      }
      Object.assign(p, { analysed: [], droneOrder: [], carriedMule: null, hungry: false, sick: false, stock });
    });
  }

  sim.seed = 0;
  if (sim.grant) {
    const lit = sim.grant.order[sim.grant.step];
    sim.grant = { order: lit === undefined ? [] : [lit], step: 0, sweep: sim.grant.sweep };
  }
  if (state.month < state.ship.arrives - 1) sim.ship = { arrives: sim.ship.arrives, goods: [], hold: {}, bought: {} };
  sim.history = sim.history.map((h) => ({
    ...h,
    before: { [playerId]: h.before[playerId] ?? emptyStock() },
    produced: { [playerId]: h.produced[playerId] ?? emptyStock() },
  }));
  return sim;
}

/** Whether this seat knows a tile's real ground. */
export function knowsGround(state: GameState, playerId: string, tile: Tile): boolean {
  const me = state.players.find((p) => p.id === playerId);
  return !!me && me.analysed.includes(tileIndex(state.width, tile.x, tile.y));
}

/**
 * A copy of the game cheap enough to play what-ifs on: the engine's rules can
 * run on it and change it without touching the real game. The history keeps
 * only the last two months (all that pricing reads), sharing their objects.
 */
export function cloneForSim(state: GameState): GameState {
  return {
    ...state,
    tiles: state.tiles.map((t) => ({ ...t, ground: { ...t.ground }, traits: t.traits.slice() })),
    players: state.players.map((p) => ({ ...p, stock: { ...p.stock }, analysed: p.analysed.slice(), droneOrder: p.droneOrder.slice() })),
    store: {
      ...state.store,
      stock: { ...state.store.stock },
      posted: { ...state.store.posted },
      refPrice: { ...state.store.refPrice },
      offWorld: { ...state.store.offWorld },
    },
    treasury: { ...state.treasury, paid: { ...state.treasury.paid } },
    ship: { ...state.ship, goods: state.ship.goods.slice(), hold: { ...state.ship.hold }, bought: { ...state.ship.bought } },
    grant: state.grant ? { ...state.grant, order: state.grant.order.slice() } : null,
    history: state.history.slice(-2),
    auction: state.auction ? structuredClone(state.auction) : null,
  };
}
