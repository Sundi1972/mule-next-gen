import { endAuction, startAuction } from './auction.js';
import { RuleError } from './errors.js';
import { DEFAULT_SPECIES, DEVELOPMENT, GAME, GOOD_CONFIG, MULE, POLLUTION, SPECIES_PERK, START, TAX, UPKEEP } from './config.js';
import { allPrices, mulePrice, planShip, postPrices, targetPrice } from './economy.js';
import { colonyLot, endLandAuction, isListed, plotAt, startLandAuction } from './lots.js';
import { generateMap, tileIndex } from './map.js';
import { airBand } from './pollution.js';
import { closeElection, newPolitics, officeScore, openPlanning, payOffices } from './politics.js';
import { needsOf, runProduction } from './production.js';
import { createRng } from './rng.js';
import { emptyStock } from './stock.js';
import { GOODS, type GameState, type Good, type Outfit, type Phase, type Player, type Species, type Tile } from './types.js';
import { runUpkeep } from './upkeep.js';

export interface NewPlayer {
  id: string;
  name: string;
  isAi: boolean;
  species?: Species;
}

export { RuleError };

/** Starts a game in month 1's planning phase. `politics: false` is the host option that plays without offices, elections or a moving tax. */
export function createGame(options: { seed: number; players: NewPlayer[]; maxMonths?: number; politics?: boolean }): GameState {
  if (options.players.length < 2 || options.players.length > 6) {
    throw new RuleError('A game needs 2 to 6 players');
  }
  const rng = createRng(options.seed);
  const map = generateMap(options.players.length, rng);
  const refPrice = emptyStock();
  for (const good of GOODS) refPrice[good] = GOOD_CONFIG[good].refPrice;

  const state: GameState = {
    seed: options.seed,
    month: 1,
    maxMonths: options.maxMonths ?? GAME.maxMonths,
    phase: 'planning',
    ...map,
    players: options.players.map(
      (p, i): Player => ({
        id: p.id,
        name: p.name,
        isAi: p.isAi,
        species: p.species ?? DEFAULT_SPECIES[i % DEFAULT_SPECIES.length]!,
        money: START.money,
        stock: { ...emptyStock(), food: 6, water: 6, energy: 4 },
        carriedMule: null,
        reputation: 50,
        claimsThisGrant: 0,
        hungry: false,
        devSeconds: DEVELOPMENT.fullSeconds,
        sick: false,
        doneDeveloping: false,
        analysed: [],
        droneOrder: [],
      }),
    ),
    store: {
      stock: { ...START.storeStock },
      mules: START.storeMules,
      mulesAtStart: START.storeMules,
      muleFactor: 1,
      capital: START.storeCapital,
      posted: { ...refPrice },
      refPrice,
      offWorld: { ...refPrice },
    },
    treasury: { money: 0, salesTax: TAX.salesTax, paid: {} },
    ship: planShip(options.seed, GAME.exportShipEvery, options.players.length),
    colonists: START.colonists,
    air: 0,
    grant: null,
    landRanOutMonth: null,
    history: [],
    auction: null,
    listings: [],
    landAuction: null,
    politics: options.politics === false ? null : newPolitics(),
  };
  // The first month's prices start where supply and demand put them.
  for (const good of GOODS) state.store.posted[good] = Math.round(targetPrice(state, good));
  openPlanning(state);
  return state;
}

export function player(state: GameState, id: string): Player {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new RuleError(`Unknown player ${id}`);
  return p;
}

function requirePhase(state: GameState, phase: Phase): void {
  if (state.phase !== phase) throw new RuleError(`Not allowed during ${state.phase}`);
}

export function freePlots(state: GameState) {
  return state.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
}

// --- Planning: geo drone ----------------------------------------------------

/** Orders a geo drone to analyse up to two free or listed plots from orbit. The results arrive when the land grant starts. */
export function orderGeoDrone(state: GameState, playerId: string, plots: { x: number; y: number }[]): void {
  requirePhase(state, 'planning');
  const p = player(state, playerId);
  if (p.droneOrder.length > 0) throw new RuleError('A drone is already on its way');
  if (plots.length === 0 || plots.length > DEVELOPMENT.dronePlots) throw new RuleError(`Pick 1 to ${DEVELOPMENT.dronePlots} plots`);
  const indices = plots.map(({ x, y }) => {
    const tile = plotAt(state, x, y);
    if (tile.owner && !isListed(state, x, y)) throw new RuleError('The drone only flies over free or listed plots');
    return tileIndex(state.width, x, y);
  });
  if (p.money < DEVELOPMENT.droneFee) throw new RuleError('Not enough money');
  p.money -= DEVELOPMENT.droneFee;
  state.store.capital += DEVELOPMENT.droneFee;
  p.droneOrder = [...new Set(indices)];
}

// --- Land grant -------------------------------------------------------------

/**
 * Free plots light up one at a time in reading order (top row first, left to
 * right), and the first player to press claims the lit plot. Every free plot
 * lights once per sweep.
 */
function newSweep(state: GameState, sweep: number): void {
  // freePlots keeps the tiles' row-major order, which is reading order.
  const order = freePlots(state).map((t) => tileIndex(state.width, t.x, t.y));
  state.grant = { order, step: 0, sweep };
}

/** The tile lit right now, or null when the grant is over. */
export function litPlot(state: GameState): Tile | null {
  if (state.phase !== 'landGrant' || !state.grant) return null;
  const index = state.grant.order[state.grant.step];
  return index === undefined ? null : state.tiles[index] ?? null;
}

/** Moves the light to the next free plot, starting a new sweep when this one is done. Returns the lit plot. */
export function advanceGrant(state: GameState): Tile | null {
  requirePhase(state, 'landGrant');
  const grant = state.grant;
  if (!grant || grantDone(state)) return null;
  for (;;) {
    grant.step++;
    if (grant.step >= grant.order.length) {
      newSweep(state, grant.sweep + 1);
      return litPlot(state);
    }
    const tile = state.tiles[grant.order[grant.step]!]!;
    if (!tile.owner) return tile;
  }
}

/**
 * The grant ends when every player has used their claims, no free land is
 * left, or the light has swept the free plots GAME.grantSweeps times: a
 * player who doesn't want land must not hold the table up.
 */
export function grantDone(state: GameState): boolean {
  if (freePlots(state).length === 0 || (state.grant?.sweep ?? 0) >= GAME.grantSweeps) return true;
  return state.players.every((p) => p.claimsThisGrant >= GAME.claimsPerGrant);
}

/** Claims the lit plot. The coordinates say which plot the player saw lit, so a late press can't grab the next one. */
export function claimPlot(state: GameState, playerId: string, x: number, y: number): void {
  requirePhase(state, 'landGrant');
  const p = player(state, playerId);
  if (p.claimsThisGrant >= GAME.claimsPerGrant) throw new RuleError('No claims left this month');
  const tile = plotAt(state, x, y);
  if (tile.owner) throw new RuleError('Plot already taken');
  if (litPlot(state) !== tile) throw new RuleError('That plot is not lit');
  tile.owner = playerId;
  p.claimsThisGrant++;
  if (state.landRanOutMonth === null && freePlots(state).length === 0) state.landRanOutMonth = state.month;
}

// --- Development ------------------------------------------------------------

function developer(state: GameState, playerId: string): Player {
  requirePhase(state, 'development');
  const p = player(state, playerId);
  if (p.doneDeveloping) throw new RuleError('Your turn is over: you went to the pub');
  return p;
}

/**
 * Sets each player's development time. Food buys time: enough for the month
 * gives the full time, and it shrinks with the shortfall. In dirty air
 * colonists get sick and lose more time, unless they take a Medicine.
 */
function startDevelopment(state: GameState): void {
  const penalty = airBand(state.air).devPenalty;
  for (const p of state.players) {
    const share = Math.min(1, p.stock.food / Math.max(1, needsOf(state, p.id).food));
    p.hungry = share < 1;
    let seconds = DEVELOPMENT.minSeconds + (DEVELOPMENT.fullSeconds - DEVELOPMENT.minSeconds) * share;
    p.sick = false;
    if (penalty > 0) {
      if (p.stock.medicine >= 1) p.stock.medicine--;
      else {
        p.sick = true;
        seconds -= penalty;
      }
    }
    p.devSeconds = Math.max(5, Math.round(seconds));
    p.doneDeveloping = false;
  }
}

/** What this player pays for an empty MULE. Gearlings pay less. */
export function mulePriceFor(state: GameState, playerId: string): number {
  const base = mulePrice(state);
  return player(state, playerId).species === 'gearling' ? Math.round(base * SPECIES_PERK.gearlingPrice) : base;
}

/** What this player pays to outfit a MULE. Gearlings pay less. */
export function outfitCostFor(state: GameState, playerId: string, outfit: Outfit): number {
  const base = MULE.outfitCost[outfit];
  return player(state, playerId).species === 'gearling' ? Math.round(base * SPECIES_PERK.gearlingPrice) : base;
}

export function buyMule(state: GameState, playerId: string): void {
  const p = developer(state, playerId);
  if (p.carriedMule) throw new RuleError('Already leading a MULE');
  if (state.store.mules <= 0) throw new RuleError('The store is out of MULEs');
  const price = mulePriceFor(state, playerId);
  if (p.money < price) throw new RuleError('Not enough money');
  p.money -= price;
  state.store.capital += price;
  state.store.mules--;
  p.carriedMule = 'empty';
}

/** Fits the MULE at an outfitter (a raw good or a green belt) or at the works counter (a factory). */
export function outfitMule(state: GameState, playerId: string, outfit: Outfit): void {
  const p = developer(state, playerId);
  if (!p.carriedMule) throw new RuleError('No MULE to outfit');
  const cost = outfitCostFor(state, playerId, outfit);
  if (p.money < cost) throw new RuleError('Not enough money');
  p.money -= cost;
  state.store.capital += cost;
  p.carriedMule = outfit;
}

export function installMule(state: GameState, playerId: string, x: number, y: number): void {
  const p = developer(state, playerId);
  if (!p.carriedMule || p.carriedMule === 'empty') throw new RuleError('The MULE is not outfitted');
  const tile = plotAt(state, x, y);
  if (tile.owner !== playerId) throw new RuleError('Not your plot');
  // Installing over an existing MULE replaces it; the old one runs away, as in the original.
  if (tile.outfit !== p.carriedMule) tile.runMonths = 0;
  tile.outfit = p.carriedMule;
  p.carriedMule = null;
}

/** Seconds a geo analysis takes this player. Mollox dig faster. */
export function analysisSeconds(state: GameState, playerId: string): number {
  const base = DEVELOPMENT.analysisSeconds;
  return player(state, playerId).species === 'mollox' ? base * SPECIES_PERK.molloxAnalysis : base;
}

/**
 * A geo analysis of any plot, owned or free: the player learns its real
 * rating for every good and its hazard traits. Private to them. Returns the
 * seconds it took, which the server takes off the player's time.
 */
export function analysePlot(state: GameState, playerId: string, x: number, y: number): number {
  const p = developer(state, playerId);
  plotAt(state, x, y);
  const index = tileIndex(state.width, x, y);
  if (!p.analysed.includes(index)) p.analysed.push(index);
  return analysisSeconds(state, playerId);
}

export function hasAnalysed(p: Player, state: GameState, tile: Tile): boolean {
  return p.analysed.includes(tileIndex(state.width, tile.x, tile.y));
}

/** Fits a filter to one of your plots, paid in Alloy from your stock. It halves the plot's air pollution and stops it spreading. */
export function fitFilter(state: GameState, playerId: string, x: number, y: number): void {
  const p = developer(state, playerId);
  const tile = plotAt(state, x, y);
  if (tile.owner !== playerId) throw new RuleError('Not your plot');
  if (tile.filter) throw new RuleError('This plot already has a filter');
  if (p.stock.alloy < DEVELOPMENT.filterAlloy) throw new RuleError(`A filter needs ${DEVELOPMENT.filterAlloy} Alloy`);
  p.stock.alloy -= DEVELOPMENT.filterAlloy;
  tile.filter = true;
}

/**
 * The pub ends your development turn and pays cash: more the more time you
 * have left, and more later in the game. A MULE you were leading runs off.
 * The server says how many seconds the player had left. Returns the payout.
 */
export function visitPub(state: GameState, playerId: string, secondsLeft: number): number {
  const p = developer(state, playerId);
  const share = Math.min(1, Math.max(0, secondsLeft / p.devSeconds));
  const { base, start, perMonth } = DEVELOPMENT.pub;
  const payout = Math.round(base + (start + state.month * perMonth) * share);
  p.money += payout;
  p.carriedMule = null;
  p.doneDeveloping = true;
  return payout;
}

// --- Phase flow -------------------------------------------------------------

const ORDER: Phase[] = ['planning', 'landGrant', 'landAuction', 'development', 'production', 'auction', 'upkeep'];

/**
 * Moves to the next phase. Production and upkeep resolve on their own when
 * entered; the land auction and the goods auction run live through
 * stepLandAuction() and stepAuction(), and leaving one early ends what is
 * still to come. Leaving the land grant, the colony may put a free plot up;
 * with nothing listed the land auction is skipped.
 */
export function advancePhase(state: GameState): void {
  if (state.phase === 'gameOver') return;
  if (state.phase === 'planning') closeElection(state);
  let next = ORDER[(ORDER.indexOf(state.phase) + 1) % ORDER.length]!;
  if (next === 'landAuction') colonyLot(state);
  if (next === 'landAuction' && state.listings.length === 0) next = 'development';
  state.phase = next;

  if (next === 'landGrant') {
    for (const p of state.players) {
      p.claimsThisGrant = 0;
      // Drone results arrive in time to pick.
      for (const i of p.droneOrder) if (!p.analysed.includes(i)) p.analysed.push(i);
      p.droneOrder = [];
    }
    newSweep(state, 0);
  }
  if (next === 'landAuction') startLandAuction(state);
  if (next === 'development') {
    // Lots the land auction didn't reach are kept.
    endLandAuction(state);
    state.grant = null;
    state.store.mulesAtStart = state.store.mules;
    startDevelopment(state);
  }
  if (next === 'production') {
    // A MULE nobody installed runs away at the end of development.
    for (const p of state.players) p.carriedMule = null;
    const price = mulePrice(state);
    const soldOut = state.store.mules === 0;
    // MULEs get dearer each month the corral sells out, and cheaper when they are left over.
    if (soldOut) state.store.muleFactor *= 1 + MULE.scarcityUp;
    else if (state.store.mules * 2 >= state.store.mulesAtStart) state.store.muleFactor = Math.max(MULE.minFactor, state.store.muleFactor * (1 - MULE.surplusDown));
    const before = Object.fromEntries(state.players.map((p) => [p.id, { ...p.stock }]));
    const { produced, pollutionBy, lines, events } = runProduction(state);
    state.history.push({
      events,
      warnings: [],
      lines,
      month: state.month,
      before,
      produced,
      prices: allPrices(state),
      shortages: [],
      storeMules: state.store.mules,
      pollutionBy,
      air: state.air,
      mulePrice: price,
      corralSoldOut: soldOut,
      storeCapital: state.store.capital,
      colonyFund: state.treasury.money,
      colonistsHungry: false,
    });
  }
  if (next === 'auction') {
    postPrices(state);
    startAuction(state);
  }
  if (next === 'upkeep') {
    // Goods the auction didn't reach trade nothing.
    endAuction(state);
    state.auction = null;
    const { shortages, hungry } = runUpkeep(state);
    payOffices(state);
    const report = state.history.at(-1);
    if (report) {
      report.shortages = shortages;
      report.colonistsHungry = hungry;
      report.storeCapital = state.store.capital;
      report.colonyFund = state.treasury.money;
    }
    if (isGameOver(state)) state.phase = 'gameOver';
  }
  if (next === 'planning') {
    state.month++;
    openPlanning(state);
  }
}

export function isGameOver(state: GameState): boolean {
  if (state.month >= state.maxMonths) return true;
  return state.landRanOutMonth !== null && state.month >= state.landRanOutMonth + GAME.landRushMonths;
}

/** True when the colony's air is in Collapse: the federation judges the colony a failure. */
export function colonyFailed(state: GameState): boolean {
  return airBand(state.air).name === 'collapse';
}

export interface ScoreParts {
  money: number;
  goods: number;
  plots: number;
  land: number;
  mules: number;
  muleValue: number;
  /** Points for terms served (POLITICS.termScore each); Collapse doesn't cut it. 0 with politics off. */
  office: number;
  /** What Collapse took off: 0 unless the colony failed. */
  cut: number;
  total: number;
}

/**
 * A final score line by line: money, goods at today's colony prices, land,
 * installed MULEs at the store price, terms in office, and the Collapse cut.
 * The lines add up to total + cut exactly; goods absorbs the rounding. See spec RULE-3.
 */
export function scoreParts(state: GameState, playerId: string): ScoreParts {
  const p = player(state, playerId);
  const prices = allPrices(state);
  const stockValue = GOODS.reduce((sum, g) => sum + p.stock[g] * prices[g], 0);
  const owned = state.tiles.filter((t) => t.owner === playerId);
  const plots = owned.length;
  const mules = owned.filter((t) => t.outfit).length;
  const land = plots * GAME.plotScore;
  const muleValue = mules * mulePrice(state);
  // Keep this exact order of addition: regrouping it moves Math.round at .5 edges and changes scores.
  const raw = p.money + stockValue + (land + muleValue);
  const before = Math.round(raw);
  // The office line joins after the rounding, so it moves no existing total.
  const office = officeScore(state, playerId);
  const kept = colonyFailed(state) ? Math.round(raw * POLLUTION.collapseScore) : before;
  const total = kept + office;
  const money = Math.round(p.money);
  return { money, goods: before - money - land - muleValue, plots, land, mules, muleValue, office, cut: before - kept, total };
}

/** Final score: scoreParts().total. */
export function score(state: GameState, playerId: string): number {
  return scoreParts(state, playerId).total;
}
