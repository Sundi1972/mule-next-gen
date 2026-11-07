/**
 * The colony-economy report: the base every price change in the colony-economy plan is judged against.
 * Plays the sim's 10 seed-1 games (politics off, then on) and prints one row per metric; add a row by appending to METRICS.
 *   pnpm --filter @mule/ai exec tsx ../../tools/colony-economy/report.ts <label> [--json <file>] [--games N] [--seed S] [--politics off|on|both]
 */
import { writeFileSync } from 'node:fs';
// Relative, not @mule/engine: that name resolves only from inside packages/ai.
import * as engine from '../../packages/engine/src/index.ts';
import { colonyScore, GOODS, GOOD_CONFIG, moodBand, mulePrice, scoreParts, SHIP_ID, STORE_ID, storeForSale, type Good, type GameState, type MoodBand, type PriceBand } from '../../packages/engine/src/index.ts';
import { simSeats } from '../../packages/ai/src/lineup.ts';
import { playGameAsync } from '../../packages/ai/src/play.ts';
import { applySets, winnerOf } from '../../packages/ai/src/sim.ts';
import { score } from '../../packages/engine/src/index.ts';
import type { PhaseFact } from '../../packages/ai/src/playbook/index.ts';

const CEILING_TIMES = 12;
const NARROW_SPREAD = 0.2;
const WATCHED: Good[] = ['food', 'water', 'energy', 'electronics'];
const MOODS: MoodBand[] = ['thriving', 'content', 'restless', 'unhappy', 'unrest'];
const BANDS: PriceBand[] = ['offWorld', 'normal', 'tight', 'short', 'severe'];
// The band store lines exist only from pricing PR-1 on; the trunk this report also runs on has none, so its rows print n/a.
const bandLines = (engine as Partial<Pick<typeof engine, 'storeLines'>>).storeLines;

function flag(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const perGood = <T>(make: () => T) => Object.fromEntries(GOODS.map((g) => [g, make()])) as Record<Good, T>;

/** One good's turn at one month's auction, as it came up. */
interface Walk {
  month: number;
  good: Good;
  storeBuy: number;
  storeSell: number;
  posted: number;
  bothQuoted: boolean;
  /** The store's stock as the good came up, and the units of it kept back for colonists: storeForSale is the rest. */
  stock: number;
  reserve: number;
}

/** A walk in which players traded between themselves while the store had none of the good for sale. */
interface SoldOutWalk {
  month: number;
  good: Good;
  /** The highest price paid between players while the store had none for sale (the engine's soldOutHigh). */
  soldOutHigh: number;
  /** The highest price paid between players at any point of that walk. */
  walkHigh: number;
}

interface GameRecord {
  seed: number;
  months: number;
  colonistsEnd: number;
  prices: Record<Good, number>[];
  /** Every price the store posted, month 1's included: history's prices miss the last month's. */
  postings: Record<Good, number>[];
  shortages: Good[][];
  colonistsHungryMonths: number;
  plotMonthsOffForEnergy: number;
  farmMonths: number;
  farmMonthsOffForEnergy: number;
  made: Record<Good, number>;
  hungrySeatMonths: number;
  soldOutMonths: Record<Good, number>;
  between: Record<Good, number>;
  traded: Record<Good, number>;
  spreads: Record<Good, number[]>;
  /** Spreads of goods whose store quoted both lines as they came up. */
  quotedSpreads: Record<Good, number[]>;
  /** With band lines only: each month, every good's spread where storeQuotes has both lines as the auction opens. */
  postedSpreads: Record<Good, number[]> | null;
  worksEnd: Record<string, number>;
  soldOutWalks: SoldOutWalk[];
  /** Each month's selling line per good: the walk's where it came up, else the band lines' as the auction opened. */
  sellLines: Partial<Record<Good, number>>[];
  /** Each month's band per good as the auction opened; empty on a base with no bands. */
  bands: Partial<Record<Good, PriceBand>>[];
  /** Each month's posted Electronics price as the auction opened, the last month's included. */
  electronicsPosted: number[];
  foodSold: { store: number; players: number; ship: number };
  devMulePrices: number[];
  /** Crystite's off-world price each month, as development opens (the walk moved it as the month opened). */
  crystiteOffWorld: number[];
  /** The price Worth counts an installed MULE at (mulePrice): at the game's end. */
  worthMulePriceEnd: number;
  muleShareOfWorth: { month1: number[]; end: number[] };
  colonyScoreEnd: number | null;
  /** S1 spike: the winner's engine score. */
  winnerScore: number;
  moodMonths: Record<MoodBand, number> | null;
}

/** Units of a good the store keeps back for colonists now: what storeForSale withholds however much it holds. */
function reserveOf(s: GameState, good: Good): number {
  const plenty = 1e9;
  const full = { ...s, store: { ...s.store, stock: { ...s.store.stock, [good]: plenty } } };
  return plenty - storeForSale(full, good);
}

/** Each seat's MULEs as a share of its Worth, as scoreParts counts both now. */
const muleShares = (s: GameState) =>
  s.players.map((p) => {
    const parts = scoreParts(s, p.id);
    return parts.total === 0 ? 0 : parts.muleValue / parts.total;
  });

async function playOne(seed: number, politics: boolean): Promise<GameRecord> {
  const specs = simSeats(4, 'trader', seed, null, null);
  const soldOutMonths = perGood(() => 0);
  const spreads = perGood<number[]>(() => []);
  const quotedSpreads = perGood<number[]>(() => []);
  const postedSpreads = bandLines ? perGood<number[]>(() => []) : null;
  const walks: Walk[] = [];
  const postings: Record<Good, number>[] = [];
  const sellLines: Partial<Record<Good, number>>[] = [];
  const bands: Partial<Record<Good, PriceBand>>[] = [];
  const electronicsPosted: number[] = [];
  let hungrySeatMonths = 0;
  const crystiteOffWorld: number[] = [];
  let month1Shares: number[] = [];
  const moods: MoodBand[] = [];
  let month = -1;
  let soldOutSeen = new Set<Good>();
  let cameUp = new Set<Good>();
  const opened = (s: GameState) => {
    postings.push({ ...s.store.posted });
    const lines: Partial<Record<Good, number>> = {};
    for (const g of GOODS) {
      if (!bandLines || !postedSpreads) continue;
      lines[g] = bandLines(s, g).sell;
      const q = engine.storeQuotes(s, g);
      if (q.buy !== null && q.sell !== null) postedSpreads[g].push((q.sell - q.buy) / s.store.posted[g]);
    }
    sellLines[s.month - 1] = lines;
    if (s.store.band) bands[s.month - 1] = { ...s.store.band };
    electronicsPosted[s.month - 1] = s.store.posted.electronics;
  };
  const watch = (s: GameState) => {
    const a = s.auction;
    if (s.month !== month) {
      month = s.month;
      soldOutSeen = new Set();
      cameUp = new Set();
      opened(s);
    }
    if (!a?.good) return;
    const good = a.good;
    if (a.stage === 'status' && !cameUp.has(good)) {
      cameUp.add(good);
      const spread = (a.storeSell - a.storeBuy) / s.store.posted[good];
      spreads[good].push(spread);
      const bothQuoted = storeForSale(s, good) > 0 && a.storeBudget > 0;
      if (bothQuoted) quotedSpreads[good].push(spread);
      walks.push({ month: s.month, good, storeBuy: a.storeBuy, storeSell: a.storeSell, posted: s.store.posted[good], bothQuoted, stock: s.store.stock[good], reserve: reserveOf(s, good) });
      sellLines[s.month - 1]![good] = a.storeSell;
    }
    // Any tick of the good's auction, the close stage included (as the sim's supplyHooks read the shelf).
    if (!soldOutSeen.has(good) && storeForSale(s, good) === 0) {
      soldOutSeen.add(good);
      soldOutMonths[good]++;
    }
  };
  const played = await playGameAsync(seed, specs, {
    politics,
    walking: true,
    // `hungry` is set by the month's upkeep and read at development, as the sim reads it.
    onPhase: (s: GameState) => {
      if (s.phase === 'development') hungrySeatMonths += s.players.filter((p) => p.hungry).length;
      if (s.phase === 'development') crystiteOffWorld.push(s.store.offWorld.crystite);
      // Upkeep has run by the time its phase is reported; the last month's upkeep goes straight to game over.
      if (s.phase === 'upkeep' && s.month === 1) month1Shares = muleShares(s);
      if (s.phase === 'upkeep' && s.colony) moods.push(moodBand(s.colony.happiness));
    },
    // Wrapping seat 0's tick sees the board before every step; it reads and changes nothing.
    onSeats: (seats) => {
      const first = seats[0];
      if (!first) return;
      const tick = first.auctionTick.bind(first);
      first.auctionTick = (state, dt, act) => {
        watch(state);
        tick(state, dt, act);
      };
    },
  });
  const { state, facts } = played;
  const between = perGood(() => 0);
  const traded = perGood(() => 0);
  const foodSold = { store: 0, players: 0, ship: 0 };
  const isHouse = (id: string) => id === STORE_ID || id === SHIP_ID;
  for (const f of facts) {
    if (f.kind !== 'trade') continue;
    traded[f.good] += f.qty;
    if (!isHouse(f.buyer) && !isHouse(f.seller)) between[f.good] += f.qty;
    if (f.good === 'food' && !isHouse(f.seller)) foodSold[f.buyer === STORE_ID ? 'store' : f.buyer === SHIP_ID ? 'ship' : 'players'] += f.qty;
  }
  const made = perGood(() => 0);
  let plotMonthsOffForEnergy = 0;
  let farmMonths = 0;
  let farmMonthsOffForEnergy = 0;
  for (const h of state.history) {
    for (const x of Object.values(h.produced)) for (const g of GOODS) made[g] += x[g];
    for (const l of h.lines ?? []) {
      const off = l.parts.some((x) => x.why === 'energyOff');
      if (off) plotMonthsOffForEnergy++;
      if (state.tiles[l.tile]!.outfit === 'food') {
        farmMonths++;
        if (off) farmMonthsOffForEnergy++;
      }
    }
  }
  const worksEnd: Record<string, number> = {};
  for (const t of state.tiles) if (t.owner && t.outfit) worksEnd[t.outfit] = (worksEnd[t.outfit] ?? 0) + 1;
  // colony.monthEnds keeps only the last two months, so the month ends are read as they pass.
  if (state.colony) moods.push(moodBand(state.colony.happiness));
  const moodMonths = state.colony ? (Object.fromEntries(MOODS.map((b) => [b, moods.filter((m) => m === b).length])) as Record<MoodBand, number>) : null;
  return {
    seed,
    months: state.history.length,
    colonistsEnd: state.colonists,
    prices: state.history.map((h) => ({ ...h.prices })),
    postings: [{ ...state.history[0]!.prices }, ...postings],
    shortages: state.history.map((h) => [...h.shortages]),
    colonistsHungryMonths: state.history.filter((h) => h.colonistsHungry).length,
    plotMonthsOffForEnergy,
    farmMonths,
    farmMonthsOffForEnergy,
    made,
    hungrySeatMonths,
    winnerScore: score(state, state.players[winnerOf(state)]!.id),
    soldOutMonths,
    between,
    traded,
    spreads,
    quotedSpreads,
    postedSpreads,
    worksEnd,
    soldOutWalks: soldOutWalks(walks, facts),
    sellLines,
    bands,
    electronicsPosted,
    foodSold,
    devMulePrices: state.history.map((h) => h.mulePrice),
    crystiteOffWorld,
    worthMulePriceEnd: mulePrice(state),
    muleShareOfWorth: { month1: month1Shares, end: muleShares(state) },
    colonyScoreEnd: colonyScore(state)?.total ?? null,
    moodMonths,
  };
}

type TradeFact = Extract<PhaseFact, { kind: 'trade' }>;

/**
 * Replays each walk's trades, one unit each in the order the market made them, against the store's shelf as the good
 * came up, to find the units players traded between themselves while the store had none for sale.
 */
function soldOutWalks(walks: readonly Walk[], facts: readonly PhaseFact[]): SoldOutWalk[] {
  const trades = new Map<string, TradeFact[]>();
  for (const f of facts) {
    if (f.kind !== 'trade' || f.phase !== 'auction') continue;
    const key = `${f.month}:${f.good}`;
    trades.set(key, [...(trades.get(key) ?? []), f]);
  }
  const out: SoldOutWalk[] = [];
  for (const w of walks) {
    let stock = w.stock;
    let soldOutHigh: number | null = null;
    let walkHigh: number | null = null;
    for (const t of trades.get(`${w.month}:${w.good}`) ?? []) {
      if (t.seller === STORE_ID) stock -= t.qty;
      else if (t.buyer === STORE_ID) stock += t.qty;
      else if (t.buyer !== SHIP_ID) {
        walkHigh = Math.max(walkHigh ?? t.price, t.price);
        if (stock - w.reserve <= 0) soldOutHigh = Math.max(soldOutHigh ?? t.price, t.price);
      }
    }
    if (soldOutHigh !== null) out.push({ month: w.month, good: w.good, soldOutHigh, walkHigh: walkHigh! });
  }
  return out;
}

const sum = (xs: readonly number[]) => xs.reduce((n, x) => n + x, 0);
/** The sim's quantile (sim.ts): the sorted value at floor(q * n), so medians match its table. */
const quantile = (xs: readonly number[], q: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};
const fmt = (n: number, d = 0) => (Number.isNaN(n) ? '-' : n.toFixed(d));
const pct = (n: number, d = 1) => `${fmt(n * 100, d)}%`;
const share = (n: number, of: number) => `${n} of ${of} (${of === 0 ? '-' : fmt((100 * n) / of, 1)}%)`;
const ceilingOf = (g: Good) => Math.round(CEILING_TIMES * GOOD_CONFIG[g].refPrice);
const monthsWhere = (gs: GameRecord[], test: (price: number, g: Good) => boolean) =>
  sum(gs.map((x) => x.prices.filter((m) => GOODS.some((g) => test(m[g], g))).length));

/**
 * UBER-AC-1's floor: sold-out walks whose good's selling line next month is under what players paid (`high`), up to the
 * ceiling. Walks in the last month have no next posting; a next line nobody read is counted apart.
 */
function floorCheck(gs: GameRecord[], high: (w: SoldOutWalk) => number): string {
  let chances = 0;
  let misses = 0;
  let unread = 0;
  for (const x of gs) {
    for (const w of x.soldOutWalks) {
      if (w.month >= x.months) continue;
      const next = x.sellLines[w.month]?.[w.good];
      if (next === undefined) {
        unread++;
        continue;
      }
      chances++;
      if (next < Math.min(high(w), CEILING_TIMES * GOOD_CONFIG[w.good].refPrice)) misses++;
    }
  }
  return `${misses} / ${chances}${unread ? ` (${unread} unread)` : ''}`;
}

const pooled = <T>(gs: GameRecord[], pick: (x: GameRecord) => T[]) => gs.flatMap(pick);
const spreadLine = (s: number[]) => (s.length === 0 ? '-' : `${share(s.filter((x) => x <= NARROW_SPREAD).length, s.length)}, min ${pct(Math.min(...s))}`);
const p50p90max = (xs: number[]) => `${fmt(quantile(xs, 0.5))} / ${fmt(quantile(xs, 0.9))} / ${fmt(Math.max(...xs))}`;

interface Metric {
  name: string;
  value: (games: GameRecord[]) => string;
}

const LABELS: Record<string, string> = { rareEarth: 'Rare earth' };
const label = (g: Good) => LABELS[g] ?? g[0]!.toUpperCase() + g.slice(1);

const METRICS: Metric[] = [
  { name: 'games / months played', value: (gs) => `${gs.length} / ${sum(gs.map((g) => g.months))}` },
  ...GOODS.map((g): Metric => ({
    name: `posted price ${label(g)} min / median / max`,
    value: (gs) => {
      const p = gs.flatMap((x) => x.prices.map((m) => m[g]));
      return `${fmt(Math.min(...p))} / ${fmt(quantile(p, 0.5))} / ${fmt(Math.max(...p))}`;
    },
  })),
  { name: `months with a posted price above ${CEILING_TIMES}x ref (any good)`, value: (gs) => String(monthsWhere(gs, (p, g) => p > CEILING_TIMES * GOOD_CONFIG[g].refPrice)) },
  { name: `months with a posted price at the ${CEILING_TIMES}x ceiling (any good)`, value: (gs) => String(monthsWhere(gs, (p, g) => p >= ceilingOf(g))) },
  {
    name: `UBER-AC-1 good-postings above ${CEILING_TIMES}x ref (every posting, the last month's included)`,
    value: (gs) => share(sum(gs.map((x) => sum(x.postings.map((m) => GOODS.filter((g) => m[g] > CEILING_TIMES * GOOD_CONFIG[g].refPrice).length)))), sum(gs.map((x) => x.postings.length * GOODS.length))),
  },
  { name: 'UBER-AC-1 sold-out floor misses / chances (high paid while sold out)', value: (gs) => floorCheck(gs, (w) => w.soldOutHigh) },
  { name: 'UBER-AC-1 sold-out floor misses / chances (high paid in the whole walk)', value: (gs) => floorCheck(gs, (w) => w.walkHigh) },
  ...WATCHED.map((g): Metric => ({ name: `store sold out of ${label(g)} at some point (goods that came up), months`, value: (gs) => String(sum(gs.map((x) => x.soldOutMonths[g]))) })),
  ...(['food', 'water', 'medicine'] as Good[]).map((g): Metric => ({ name: `colonists short of ${label(g)} (months)`, value: (gs) => String(sum(gs.map((x) => x.shortages.filter((m) => m.includes(g)).length))) })),
  { name: "colonists short of Food or Water (months, the sim's figure)", value: (gs) => String(sum(gs.map((x) => x.colonistsHungryMonths))) },
  { name: 'S1 colony Food made a month (mean over game-months)', value: (gs) => fmt(sum(gs.map((x) => x.made.food)) / sum(gs.map((x) => x.months)), 1) },
  { name: 'S1 winner score median', value: (gs) => fmt(quantile(gs.map((x) => x.winnerScore), 0.5)) },
  { name: 'hungry seat-months', value: (gs) => String(sum(gs.map((x) => x.hungrySeatMonths))) },
  { name: 'colonists at the end (mean)', value: (gs) => fmt(sum(gs.map((x) => x.colonistsEnd)) / gs.length, 1) },
  { name: 'farm-months switched off for Energy', value: (gs) => share(sum(gs.map((x) => x.farmMonthsOffForEnergy)), sum(gs.map((x) => x.farmMonths))) },
  { name: 'plot-months switched off for Energy (all plots)', value: (gs) => String(sum(gs.map((x) => x.plotMonthsOffForEnergy))) },
  ...(['food', 'water', 'energy'] as Good[]).map((g): Metric => ({
    name: `between-player share of ${label(g)} units traded`,
    value: (gs) => share(sum(gs.map((x) => x.between[g])), sum(gs.map((x) => x.traded[g]))),
  })),
  ...WATCHED.map((g): Metric => ({
    name: `quoted spread p50 ${label(g)} (n)`,
    value: (gs) => {
      const s = gs.flatMap((x) => x.spreads[g]);
      return `${fmt(quantile(s, 0.5) * 100, 1)}% (${s.length})`;
    },
  })),
  ...GOODS.map((g): Metric => ({
    name: `UBER-AC-2 ${label(g)} came-up months spread <= 20% (both quoted), min`,
    value: (gs) => spreadLine(pooled(gs, (x) => x.quotedSpreads[g])),
  })),
  {
    name: 'UBER-AC-2 every good-month spread <= 20% (storeQuotes both quoted as the auction opens), min',
    value: (gs) => (gs.some((x) => x.postedSpreads === null) ? 'n/a' : spreadLine(pooled(gs, (x) => GOODS.flatMap((g) => x.postedSpreads![g])))),
  },
  {
    name: 'AI Food sold to the store: per-game median / total',
    value: (gs) => `${fmt(quantile(gs.map((x) => x.foodSold.store), 0.5))} / ${sum(gs.map((x) => x.foodSold.store))}`,
  },
  {
    name: 'AI Food sold to other players: per-game median / total',
    value: (gs) => `${fmt(quantile(gs.map((x) => x.foodSold.players), 0.5))} / ${sum(gs.map((x) => x.foodSold.players))}`,
  },
  { name: 'AI Food sold to the ship (total)', value: (gs) => String(sum(gs.map((x) => x.foodSold.ship))) },
  { name: 'MULE price at development p50 / p90 / max (all months)', value: (gs) => p50p90max(pooled(gs, (x) => x.devMulePrices)) },
  {
    name: "MULE Worth ratio (game-end Worth price / month-1 dev price) p10 / p50 / p90 / max",
    value: (gs) => {
      const r = gs.map((x) => x.worthMulePriceEnd / x.devMulePrices[0]!);
      return `${fmt(quantile(r, 0.1), 2)} / ${fmt(quantile(r, 0.5), 2)} / ${fmt(quantile(r, 0.9), 2)} / ${fmt(Math.max(...r), 2)}`;
    },
  },
  { name: 'MULE Worth ratio: games at 10x or more', value: (gs) => share(gs.filter((x) => x.worthMulePriceEnd / x.devMulePrices[0]! >= 10).length, gs.length) },
  {
    name: "MULE share of a seat's Worth, median: month 1's end / game end",
    value: (gs) => `${pct(quantile(pooled(gs, (x) => x.muleShareOfWorth.month1), 0.5))} / ${pct(quantile(pooled(gs, (x) => x.muleShareOfWorth.end), 0.5))}`,
  },
  {
    name: 'colony score at game end, median',
    value: (gs) => {
      const s = gs.flatMap((x) => (x.colonyScoreEnd === null ? [] : [x.colonyScoreEnd]));
      return s.length === 0 ? 'n/a' : fmt(quantile(s, 0.5));
    },
  },
  {
    name: `colony months by mood (${MOODS.join(' / ')})`,
    value: (gs) => (gs.every((x) => x.moodMonths === null) ? 'n/a' : MOODS.map((b) => sum(gs.map((x) => x.moodMonths?.[b] ?? 0))).join(' / ')),
  },
  { name: 'Electronics works standing at the end (all games)', value: (gs) => String(sum(gs.map((x) => x.worksEnd.electronics ?? 0))) },
  {
    name: 'Electronics posted price by month, median over games (month 1, 2, ...)',
    value: (gs) => {
      const months = Math.max(...gs.map((x) => x.electronicsPosted.length));
      return Array.from({ length: months }, (_, m) => fmt(quantile(gs.flatMap((x) => (x.electronicsPosted[m] === undefined ? [] : [x.electronicsPosted[m]!])), 0.5))).join(' ');
    },
  },
  {
    name: `Electronics months by band (${BANDS.join(' / ')})`,
    value: (gs) => (gs.every((x) => x.bands.length === 0) ? 'n/a' : BANDS.map((b) => sum(gs.map((x) => x.bands.filter((m) => m?.electronics === b).length))).join(' / ')),
  },
  { name: `Electronics months posted at the ${CEILING_TIMES}x ceiling`, value: (gs) => String(sum(gs.map((x) => x.electronicsPosted.filter((p) => p >= ceilingOf('electronics')).length))) },
  { name: 'Electronics made (all games)', value: (gs) => String(sum(gs.map((x) => x.made.electronics))) },
  { name: 'Rare earth made (all games)', value: (gs) => String(sum(gs.map((x) => x.made.rareEarth))) },
  { name: 'Alloy made (all games)', value: (gs) => String(sum(gs.map((x) => x.made.alloy))) },
  {
    name: 'UBER-AC-3 Crystite off-world price min / median / max (all months)',
    value: (gs) => {
      const p = pooled(gs, (x) => x.crystiteOffWorld);
      return `${fmt(Math.min(...p))} / ${fmt(quantile(p, 0.5))} / ${fmt(Math.max(...p))}`;
    },
  },
  ...([
    ['above 200', (p: number) => p > 200],
    ['at 280 or more', (p: number) => p >= 280],
    ['at 50 or less', (p: number) => p <= 50],
  ] as const).map(([where, test]): Metric => ({
    name: `UBER-AC-3 Crystite off-world months ${where}`,
    value: (gs) => {
      const p = pooled(gs, (x) => x.crystiteOffWorld);
      return share(p.filter(test).length, p.length);
    },
  })),
];

async function main() {
  const sets: string[] = [];
  process.argv.forEach((a, i) => { if (a === '--set') sets.push(process.argv[i + 1]!); });
  if (sets.length) process.stderr.write(`config: ${applySets(sets).join(' ')}\n`);
  const name = flag('label') ?? process.argv[2] ?? '?';
  const games = Number(flag('games', '10'));
  const first = Number(flag('seed', '1'));
  const json = flag('json');
  const which = flag('politics', 'both');
  const columns = (which === 'both' ? ['off', 'on'] : [which]) as ('off' | 'on')[];
  if (columns.some((c) => c !== 'off' && c !== 'on')) throw new Error(`--politics takes off, on or both, not ${which}`);
  const played: Partial<Record<'off' | 'on', GameRecord[]>> = {};
  const t0 = Date.now();
  for (const column of columns) {
    const recs: GameRecord[] = [];
    for (let seed = first; seed < first + games; seed++) {
      const rec = await playOne(seed, column === 'on');
      recs.push(rec);
      process.stderr.write(`${name} politics ${column.padEnd(3)} seed ${seed}: ${rec.months} months, colonists ${rec.colonistsEnd}\n`);
    }
    played[column] = recs;
  }
  process.stderr.write(`elapsed ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  const heads = columns.map((c) => `politics ${c}`);
  const rows = METRICS.map((m) => [m.name, ...columns.map((c) => m.value(played[c]!))]);
  const widths = heads.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i + 1]!.length)));
  const w0 = Math.max(...rows.map((r) => r[0]!.length));
  console.log(`colony-economy report: ${name} (${games} games from seed ${first}, 4 trader seats, walking on)${sets.length ? ` config: ${sets.join(' ')}` : ''}\n`);
  console.log(`${''.padEnd(w0)}  ${heads.map((h, i) => h.padStart(widths[i]!)).join('  ')}`);
  for (const [n, ...vs] of rows) console.log(`${n!.padEnd(w0)}  ${vs.map((v, i) => v.padStart(widths[i]!)).join('  ')}`);
  if (json) writeFileSync(json, JSON.stringify({ label: name, games, firstSeed: first, ...played }, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
