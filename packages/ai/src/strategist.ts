import {
  airPoints,
  DEVELOPMENT,
  GAME,
  GOOD_CONFIG,
  mulePrice,
  mulePriceFor,
  neighbours,
  POLLUTION,
  PROCESSED_GOODS,
  RAW_GOODS,
  STRATEGIST,
  shipInPort,
  shipPrice,
  tileIndex,
  type GameState,
  type Good,
  type Outfit,
  type Tile,
} from '@mule/engine';
import { outlook, type Outlook } from './outlook.js';
import { candidate, consider, curve, shortlist, type Candidate, type Shortlist } from './utility.js';
import { canFeed, cashReserve, installGain, unitValues, yieldOf, type Mind, type UnitValues } from './value.js';

/**
 * The strategist: for each of the month's decisions it lists the options,
 * scores each with named considerations, drops the ones a hard rule forbids
 * and hands the near-best few to a decider. It reads only the seat's
 * observation (engine `observe`) and never changes the real game.
 */

export const GOOD_NAME: Record<Good, string> = {
  food: 'Food',
  water: 'Water',
  energy: 'Energy',
  smithore: 'Smithore',
  crystite: 'Crystite',
  rareEarth: 'Rare earth',
  alloy: 'Alloy',
  electronics: 'Electronics',
  medicine: 'Medicine',
};

export const outfitName = (o: Outfit) => (o === 'greenBelt' ? 'green belt' : isFactoryGood(o) ? `${GOOD_NAME[o]} works` : `${GOOD_NAME[o]} MULE`);
const isFactoryGood = (o: Outfit) => (PROCESSED_GOODS as readonly string[]).includes(o);
export const plotName = (t: Tile) => `plot ${t.x + 1}·${t.y + 1} (${t.terrain})`;
const OUTFITS: Outfit[] = [...RAW_GOODS, ...PROCESSED_GOODS, 'greenBelt'];
const cr = (n: number) => `${Math.round(n)} cr`;

function me(obs: GameState, mind: Mind) {
  return obs.players.find((p) => p.id === mind.me)!;
}

/** The rival with the most public wealth: money, land and MULEs. */
export function leaderOf(obs: GameState, self: string): string | null {
  const price = mulePrice(obs);
  const worth = (id: string) => {
    const p = obs.players.find((q) => q.id === id)!;
    const plots = obs.tiles.filter((t) => t.owner === id);
    return p.money + plots.length * GAME.plotScore + plots.filter((t) => t.outfit).length * price;
  };
  const rivals = obs.players.filter((p) => p.id !== self).sort((a, b) => worth(b.id) - worth(a.id));
  return rivals[0]?.id ?? null;
}

// --- Land --------------------------------------------------------------------

export type Focus = 'best' | 'grown' | 'mined' | 'factory' | 'cluster' | 'block';

export interface PlotScore {
  index: number;
  utility: number;
  value: number;
  outfit: Outfit;
  label: string;
}

export interface LandPlan {
  focus: Focus;
  /** Every free plot, best first for this plan. The hands claim from it. */
  ranking: PlotScore[];
}

const FOCUS_OUTFITS: Record<Focus, Outfit[] | null> = {
  best: null,
  grown: ['food', 'water', 'energy'],
  mined: ['smithore', 'crystite', 'rareEarth'],
  factory: ['alloy', 'electronics', 'medicine'],
  cluster: null,
  block: null,
};

const FOCUS_LABEL: Record<Focus, string> = {
  best: 'Take the most valuable land',
  grown: 'Farms and power first: feed myself',
  mined: 'Mines for the export trade',
  factory: 'Ground for a factory',
  cluster: 'Grow my own patch',
  block: 'Fence in the leader',
};

/** Scores one free plot for a plan. */
function plotGains(obs: GameState, o: Outlook, tile: Tile, mind: Mind): Map<Outfit, number> {
  const gains = new Map<Outfit, number>();
  for (const outfit of OUTFITS) {
    if (outfit === 'greenBelt' || (isFactoryGood(outfit) && !canFeed(obs, mind.me, outfit))) continue;
    gains.set(outfit, installGain(obs, o, tile, outfit, mind).gain);
  }
  return gains;
}

function scorePlot(obs: GameState, gains: Map<Outfit, number>, tile: Tile, focus: Focus, mind: Mind, leader: string | null): Candidate<{ index: number; outfit: Outfit }> {
  const allowed = FOCUS_OUTFITS[focus];
  let best: { outfit: Outfit; gain: number } = { outfit: 'food', gain: -Infinity };
  let any: { outfit: Outfit; gain: number } = { outfit: 'food', gain: -Infinity };
  for (const [outfit, gain] of gains) {
    if (gain > any.gain) any = { outfit, gain };
    if ((!allowed || allowed.includes(outfit)) && gain > best.gain) best = { outfit, gain };
  }
  if (best.gain === -Infinity) best = any;
  const around = neighbours(obs.tiles, obs.width, tile);
  const ownAround = around.filter((t) => t.owner === mind.me).length;
  const leaderAround = leader ? around.filter((t) => t.owner === leader).length : 0;
  const known = obs.players.find((p) => p.id === mind.me)!.analysed.includes(tileIndex(obs.width, tile.x, tile.y));
  const spite = mind.level.sabotage ? mind.persona.spite : 0;
  const cons = [
    consider('Best use', curve.gain(best.gain, STRATEGIST.gainScale.plot), mind.persona.greed, `${outfitName(best.outfit)} here earns about ${cr(best.gain)} over the game`),
    consider('Known ground', known ? 1 : 0.8, mind.persona.risk, known ? 'ground analysed' : 'ground not analysed: a guess from the terrain'),
    consider('Next to my land', curve.floor(ownAround / 2, 0.6), focus === 'cluster' ? 2 : 0.5, `${ownAround} of my plots beside it`),
  ];
  if (focus === 'block') cons.push(consider('Blocks the leader', curve.floor(leaderAround / 2, 0.4), Math.max(0.5, spite), `${leaderAround} of the leader's plots beside it`));
  const index = tileIndex(obs.width, tile.x, tile.y);
  return candidate(`plot:${index}`, plotName(tile), { index, outfit: best.outfit }, best.gain + GAME.plotScore, cons);
}

/** The land plans for this month, each with its full ranking of free plots. */
export function landDecision(obs: GameState, mind: Mind): Shortlist<LandPlan> {
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const free = obs.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
  const leader = leaderOf(obs, mind.me);
  const focuses: Focus[] = ['best', 'grown', 'mined', 'factory', 'cluster'];
  if (mind.level.sabotage && mind.persona.spite > 0 && leader) focuses.push('block');
  const claims = GAME.claimsPerGrant;
  const p = me(obs, mind);
  const reserve = cashReserve(obs, mind, o);
  const shortOfFood = !obs.tiles.some((t) => t.owner === mind.me && t.outfit === 'food') || !obs.tiles.some((t) => t.owner === mind.me && t.outfit === 'energy');

  const gains = new Map(free.map((t) => [t, plotGains(obs, o, t, mind)]));
  const plans = focuses.map((focus) => {
    const ranking = free
      .map((t) => scorePlot(obs, gains.get(t)!, t, focus, mind, leader))
      .sort((a, b) => b.utility - a.utility)
      .map((c): PlotScore => ({ index: c.action.index, utility: c.utility, value: c.value, outfit: c.action.outfit, label: c.label }));
    const top = ranking.slice(0, claims);
    const worth = top.reduce((n, s) => n + s.value, 0);
    const cons = [
      consider('Worth of the best plots', curve.gain(worth - 600, STRATEGIST.gainScale.plot * claims), mind.persona.greed, `its best ${claims} plots are worth about ${cr(worth)}`),
      consider(
        'Feeds me',
        focus === 'grown' ? (shortOfFood ? 1 : 0.75) : shortOfFood ? 0.6 : 0.75,
        mind.persona.reserve,
        shortOfFood ? 'I still buy my Food and Energy' : 'my Food and Energy are covered',
      ),
      consider('Can develop it', curve.ramp(p.money - reserve, 0, mulePrice(obs) * 2), focus === 'factory' ? 1 : 0.3, `${cr(p.money)} on hand, ${cr(reserve)} kept back`),
    ];
    if (focus === 'block') cons.push(consider('Hurts the leader', 0.7, mind.persona.spite, 'the leader needs room to grow'));
    const labels = top.map((s) => s.label).join(' and ');
    return candidate<LandPlan>(`land:${focus}`, `${FOCUS_LABEL[focus]}: ${labels || 'nothing left'}`, { focus, ranking }, worth, cons);
  });
  return shortlist(plans, mind.level.shortlist, mind.level.shortlistTolerance);
}

/**
 * Whether the hands should press for the lit plot: it must clear a share of
 * the best plot still free in the plan's ranking (lower after the first
 * sweep, so the seat doesn't end the month empty-handed). Never while the
 * seat already holds a month's worth of idle plots it can't pay to develop:
 * hoarded land earns nothing and every idle plot counts as Smithore demand.
 */
export function wantsPlot(plan: LandPlan, obs: GameState, index: number, sweep: number, mind: Mind): boolean {
  const idle = obs.tiles.filter((t) => t.owner === mind.me && !t.outfit).length;
  if (idle >= mind.level.mulesPerMonth && me(obs, mind).money < (idle + 1) * mulePriceFor(obs, mind.me)) return false;
  const free = new Set(obs.tiles.map((t, i) => (t.owner === null && t.terrain !== 'store' ? i : -1)).filter((i) => i >= 0));
  const open = plan.ranking.filter((s) => free.has(s.index));
  const lit = open.find((s) => s.index === index);
  if (!lit) return sweep > 1;
  if (sweep > 1) return true;
  const share = sweep === 0 ? STRATEGIST.grantShare : STRATEGIST.grantLaterShare;
  return lit.utility >= (open[0]?.utility ?? 0) * share;
}

// --- Values for lot bids ----------------------------------------------------

export function plotValue(obs: GameState, mind: Mind, index: number): number {
  throw new Error('NotImplemented: plotValue');
}

export function muleValue(obs: GameState, mind: Mind): number {
  throw new Error('NotImplemented: muleValue');
}

// --- Development -------------------------------------------------------------

export type DevAction = { kind: 'install'; index: number; outfit: Outfit } | { kind: 'stop' };

/**
 * The next MULE, or none: per idle plot of the seat, every outfit and
 * factory, plus keeping the cash. Hard rules: no MULE the cash can't pay for
 * without leaving the reserve, no factory it can't feed, nothing when the
 * corral is empty or the month's MULEs are used.
 */
export function developDecision(obs: GameState, mind: Mind, mulesSoFar: number): Shortlist<DevAction> {
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const p = me(obs, mind);
  const reserve = cashReserve(obs, mind, o);
  const idle = obs.tiles.filter((t) => t.owner === mind.me && !t.outfit);
  const needFood = !obs.tiles.some((t) => t.owner === mind.me && t.outfit === 'food');
  const needEnergy = !obs.tiles.some((t) => t.owner === mind.me && t.outfit === 'energy');
  const analysed = new Set(p.analysed);
  const cands: Candidate<DevAction>[] = [];
  const common = (cashAfter: number, known: boolean, feeds: boolean, gain: number, why: string) => [
    consider('Gain', curve.gain(gain, STRATEGIST.gainScale.develop), mind.persona.greed, why),
    consider('Cash left', curve.floor(curve.ramp(cashAfter, reserve, reserve * 2), STRATEGIST.cashLeftFloor), mind.persona.reserve, `${cr(cashAfter)} left, ${cr(reserve)} kept back`),
    consider('Known ground', known ? 1 : 0.75, mind.persona.risk, known ? 'ground analysed' : 'ground not analysed'),
    consider('Feeds me', feeds ? 1 : 0.8, mind.persona.reserve * 0.5, feeds ? 'covers my own Food or Energy' : 'I buy my Food and Energy'),
  ];
  for (const tile of idle) {
    const index = tileIndex(obs.width, tile.x, tile.y);
    for (const outfit of OUTFITS) {
      const { gain, cost, net } = installGain(obs, o, tile, outfit, mind);
      const cashAfter = p.money - cost;
      const feeds = (outfit === 'food' && needFood) || (outfit === 'energy' && needEnergy);
      // A farm for a good it is short of is the cure, not a risk: it needn't keep cash back to buy that good.
      const cures = outfit === 'food' || outfit === 'water' || outfit === 'energy' ? outfit : undefined;
      const keepBack = cures ? cashReserve(obs, mind, o, cures) : reserve;
      let veto: string | null = null;
      if (obs.store.mules <= 0) veto = 'the corral is empty';
      else if (mulesSoFar >= mind.level.mulesPerMonth) veto = `already led ${mulesSoFar} MULEs out this month`;
      else if (cashAfter < 0) veto = `it costs ${cr(cost)}, more than the ${cr(p.money)} on hand`;
      // What the MULE makes arrives before the auction the reserve is kept for, so it counts toward it.
      else if (cashAfter + Math.max(0, net) < keepBack) veto = `it would leave ${cr(cashAfter)}, under the ${cr(keepBack)} kept for upkeep`;
      else if (!canFeed(obs, mind.me, outfit)) veto = `nothing to feed the ${outfitName(outfit)} with`;
      cands.push(
        candidate<DevAction>(
          `install:${outfit}:${index}`,
          `${outfitName(outfit)} on ${plotName(tile)}`,
          { kind: 'install', index, outfit },
          gain,
          common(cashAfter, analysed.has(index) || outfit === 'greenBelt', feeds, gain, `makes about ${cr(net)} a month, costs ${cr(cost)}, worth ${cr(gain)} over the game`),
          veto,
        ),
      );
    }
  }
  cands.push(candidate<DevAction>('stop', 'Keep the cash', { kind: 'stop' }, 0, common(p.money, true, false, 0, 'no new MULE: the money stays in the bank')));
  return shortlist(cands, mind.level.shortlist, mind.level.shortlistTolerance);
}

/** Own idle plots worth a geo analysis: their best and second-best uses are close on the terrain's average ground. */
export function analysesWanted(obs: GameState, mind: Mind, secondsLeft: number): number[] {
  if (secondsLeft < STRATEGIST.analyseMinSeconds) return [];
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const p = me(obs, mind);
  const out: { index: number; closeness: number }[] = [];
  for (const tile of obs.tiles) {
    const index = tileIndex(obs.width, tile.x, tile.y);
    if (tile.owner !== mind.me || tile.outfit || p.analysed.includes(index)) continue;
    const gains = OUTFITS.filter((x) => x !== 'greenBelt')
      .map((x) => installGain(obs, o, tile, x, mind).gain)
      .sort((a, b) => b - a);
    const [a = 0, b = 0] = gains;
    const closeness = Math.abs(a - b) / Math.max(1, Math.abs(a));
    if (closeness < STRATEGIST.analyseWhenClose) out.push({ index, closeness });
  }
  const per = mind.level.fullScoring ? STRATEGIST.analysesPerMonth : 1;
  const budget = Math.floor((secondsLeft - STRATEGIST.analyseMinSeconds) / DEVELOPMENT.analysisSeconds) + 1;
  return out
    .sort((x, y) => x.closeness - y.closeness)
    .slice(0, Math.max(0, Math.min(per, budget)))
    .map((x) => x.index);
}

/** Own unfiltered polluters to fit with a filter while the air is turning and Alloy lasts, worst first. */
export function filtersWanted(obs: GameState, mind: Mind): number[] {
  if (!mind.level.fullScoring || obs.air < POLLUTION.bands[1].from - 10) return [];
  const alloy = me(obs, mind).stock.alloy;
  return obs.tiles
    .filter((t) => t.owner === mind.me && !t.filter && airPoints(t) > 1)
    .sort((a, b) => airPoints(b) - airPoints(a))
    .slice(0, alloy)
    .map((t) => tileIndex(obs.width, t.x, t.y));
}

export { yieldOf };

// --- Auction -----------------------------------------------------------------

export type TradeAction = { side: 'seller'; keep: number } | { side: 'buyer'; upTo: number } | { side: 'pass' };

export interface GoodPlan {
  good: Good;
  values: UnitValues;
  /** The most it spends on this good. */
  budget: number;
  /** Cash it won't go under, except for the Food and Energy it needs. */
  reserve: number;
  /** Extra it pays over its own value to keep units from the leader, when spite is on. */
  spiteBid: number;
  /** Extra value per unit, up to the others' shortfall, for cornering a scarce good. */
  corner: { units: number; premium: number };
}

/** What the seat makes of the good that is up: the value of every unit, the cash it spends, and whether it corners or spites. */
export function goodPlan(obs: GameState, mind: Mind, good: Good): GoodPlan {
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const values = unitValues(obs, o, good, mind);
  const p = me(obs, mind);
  const reserve = cashReserve(obs, mind);
  const budget = Math.max(0, Math.min(p.money * STRATEGIST.budgetShare, p.money - reserve));
  const a = obs.auction;
  const rows = a?.good === good ? a.status : [];
  const others = rows.filter((r) => r.id !== mind.me);
  const shortfall = others.reduce((n, r) => n + Math.max(0, r.need - r.now), 0);
  const scarce = obs.store.stock[good] <= shortfall;
  const cornering = mind.level.corners && mind.persona.corner > 0 && scarce && shortfall > 0 && GOOD_CONFIG[good].spoilage < 0.5;
  const next = o.final ? obs.store.posted[good] : o.price(good);
  const corner = cornering ? { units: Math.min(shortfall, 6), premium: next * STRATEGIST.cornerPremium * mind.persona.corner } : { units: 0, premium: 0 };
  const leader = leaderOf(obs, mind.me);
  const leaderShort = leader ? rows.some((r) => r.id === leader && r.now < r.need) : false;
  const spiteBid = mind.level.sabotage && leaderShort ? Math.round(next * 0.1 * mind.persona.spite) : 0;
  if (corner.units > 0 || spiteBid > 0) {
    // Raise the buy ceiling of the next few units the seat doesn't hold yet.
    const h = p.stock[good];
    for (let k = h; k < h + Math.max(corner.units, spiteBid > 0 ? 2 : 0) && k < values.buy.length; k++) {
      values.buy[k] = values.buy[k]! + (k - h < corner.units ? corner.premium : 0) + spiteBid;
    }
    values.buy.sort((x, y) => y - x);
  }
  return { good, values, budget, reserve, spiteBid, corner };
}

/** The price the seat expects to get for a unit, and to pay: the houses' lines while they trade, otherwise around the posted price. */
export function expectedPrices(obs: GameState, good: Good): { sell: number; buy: number } {
  const a = obs.auction;
  const posted = obs.store.posted[good];
  const storeBuy = a?.good === good ? (a.storeBudget > 0 ? a.storeBuy : 0) : Math.floor(posted * 0.9);
  const ship = shipInPort(obs) ? (shipPrice(obs, good) ?? 0) : 0;
  const sell = Math.max(storeBuy, ship, Math.floor(posted * 0.85));
  const storeSell = a?.good === good ? a.storeSell : Math.ceil(posted * 1.1);
  return { sell, buy: storeSell };
}

/**
 * Buy, sell or pass on the good that is up, and how far: sell down to what
 * its own units are worth, or keep a buffer; buy what it needs, or what it
 * can resell too. Hard rules: never sells the Food or Energy it needs, never
 * buys past its budget or into its upkeep reserve.
 */
export function tradeDecision(obs: GameState, mind: Mind, plan: GoodPlan): Shortlist<TradeAction> {
  const good = plan.good;
  const p = me(obs, mind);
  const h = p.stock[good];
  const { sell, buy } = expectedPrices(obs, good);
  const v = plan.values;
  const cands: Candidate<TradeAction>[] = [];
  const gainCons = (gain: number, cashAfter: number, sure: number, why: string, sureWhy: string) => [
    consider('Gain', curve.gain(gain, STRATEGIST.gainScale.trade), mind.persona.greed, why),
    consider('Cash left', curve.floor(curve.ramp(cashAfter, plan.reserve, plan.reserve * 2), STRATEGIST.cashLeftFloor), mind.persona.reserve, `${cr(cashAfter)} left after, ${cr(plan.reserve)} kept back`),
    consider('Sure thing', sure, mind.persona.risk, sureWhy),
  ];

  // Sell: down to the units worth more to it than the sale.
  let keepAt = h;
  while (keepAt > 0 && (v.keep[keepAt - 1] ?? 0) < sell) keepAt--;
  const sellTo = (keep: number, label: string, key: string) => {
    let gain = 0;
    for (let k = keep; k < h; k++) gain += sell - (v.keep[k] ?? 0);
    const veto = keep < v.floorUnits ? `it needs ${v.floorUnits} ${GOOD_NAME[good]} itself` : null;
    cands.push(
      candidate<TradeAction>(key, label, { side: 'seller', keep }, gain, gainCons(gain, p.money + (h - keep) * sell, 0.9, `sells ${h - keep} at about ${sell}, worth ${cr(gain)} more than keeping them`, 'the store or the ship will take them'), veto),
    );
  };
  if (keepAt < h) {
    sellTo(keepAt, `Sell ${h - keepAt} ${GOOD_NAME[good]}, keep ${keepAt}`, 'sell');
    const buffer = Math.min(h - 1, keepAt + Math.max(1, Math.ceil(v.need / 2)));
    if (buffer > keepAt && buffer < h) sellTo(buffer, `Sell ${h - buffer} ${GOOD_NAME[good]}, keep a buffer of ${buffer}`, 'sell:buffer');
  }

  // Buy: up to the last unit worth more than its price, within the budget.
  let upTo = h;
  let spent = 0;
  while (upTo < v.buy.length && (v.buy[upTo] ?? 0) > buy && spent + buy <= plan.budget) {
    spent += buy;
    upTo++;
  }
  const buyTo = (target: number, label: string, key: string, sure: number, sureWhy: string) => {
    let gain = 0;
    for (let k = h; k < target; k++) gain += (v.buy[k] ?? 0) - buy;
    const cost = (target - h) * buy;
    const essential = target <= v.block && (good === 'food' || good === 'energy');
    const veto = !essential && p.money - cost < plan.reserve ? `it would dip into the ${cr(plan.reserve)} kept for upkeep` : null;
    cands.push(candidate<TradeAction>(key, label, { side: 'buyer', upTo: target }, gain, gainCons(gain, p.money - cost, sure, `buys ${target - h} at about ${buy}, worth ${cr(gain)} more to it`, sureWhy), veto));
  };
  if (upTo > h) {
    const needOnly = Math.min(upTo, Math.max(h, v.block));
    const speculative = upTo > Math.max(h, v.block);
    buyTo(upTo, `Buy ${upTo - h} ${GOOD_NAME[good]}${speculative ? ' (some to resell)' : ''}`, 'buy', speculative ? 0.6 : 0.9, speculative ? 'resale next month is a forecast' : 'it needs them');
    if (speculative && needOnly > h) buyTo(needOnly, `Buy ${needOnly - h} ${GOOD_NAME[good]}, just what I need`, 'buy:need', 0.9, 'it needs them');
  }

  cands.push(candidate<TradeAction>('pass', `Pass on ${GOOD_NAME[good]}`, { side: 'pass' }, 0, gainCons(0, p.money, 1, 'no trade', 'nothing at stake')));
  return shortlist(cands, mind.level.shortlist, mind.level.shortlistTolerance);
}
