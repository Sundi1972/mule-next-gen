import { endAuction, startAuction } from './auction.js';
import { RuleError } from './errors.js';
import { DEFAULT_SPECIES, DEV_STEER, DEVELOPMENT, GAME, GLINT, GOOD_CONFIG, mapSize, MULE, POLLUTION, SPECIES_PERK, START, TAX, UPKEEP, WOLVES } from './config.js';
import { allPrices, mulePrice, planShip, postPrices, targetPrice } from './economy.js';
import { rollPlayerEvent } from './events.js';
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
  if (options.players.length < GAME.minPlayers || options.players.length > GAME.maxPlayers) {
    throw new RuleError(`A game needs ${GAME.minPlayers} to ${GAME.maxPlayers} players`);
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
        stock: { ...emptyStock(), ...START.playerStock },
        carriedMule: null,
        reputation: START.reputation,
        claimsThisGrant: 0,
        doneWithLand: false,
        hungry: false,
        devSeconds: DEVELOPMENT.fullSeconds,
        sick: false,
        doneDeveloping: false,
        installedThisTurn: false,
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
 * The grant ends when every player has used their claims or pressed Done, no
 * free land is left, or the light has passed every free plot (GAME.grantSweeps
 * passes): a player who doesn't want land must not hold the table up.
 */
export function grantDone(state: GameState): boolean {
  if (freePlots(state).length === 0 || (state.grant?.sweep ?? 0) >= GAME.grantSweeps) return true;
  return state.players.every((p) => p.claimsThisGrant >= GAME.claimsPerGrant || p.doneWithLand);
}

/** Done with land: the player claims no more in this grant. Pressing it again changes nothing. */
export function grantPass(state: GameState, playerId: string): void {
  requirePhase(state, 'landGrant');
  player(state, playerId).doneWithLand = true;
}

const LARGEST_MAP = mapSize(GAME.maxPlayers);

/**
 * The longest a land grant can run: one pass of the light over every plot of the largest map. An upper bound; the
 * grant has no phase clock, and phaseScale never shortens its tick.
 */
export const GRANT_PASS_MAX_MS = LARGEST_MAP.width * LARGEST_MAP.height * GAME.grantTickMs;

/** Claims the lit plot. The coordinates say which plot the player saw lit, so a late press can't grab the next one. */
export function claimPlot(state: GameState, playerId: string, x: number, y: number): void {
  requirePhase(state, 'landGrant');
  const p = player(state, playerId);
  if (p.claimsThisGrant >= GAME.claimsPerGrant) throw new RuleError('No claims left this month');
  if (p.doneWithLand) throw new RuleError('You are done with land this month');
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
 * Starts development: one clock, the same full time for every player. A
 * player short of the month's Food is hungry. Each player rolls for
 * sickness (events.ts, likelier in dirty air and for a big polluter); a
 * Medicine cures it, and is used up. Hunger and sickness slow the walk
 * (dev-walk.ts).
 */
function startDevelopment(state: GameState): void {
  for (const p of state.players) {
    p.hungry = p.stock.food < Math.max(1, needsOf(state, p.id).food);
    p.sick = false;
    if (rollPlayerEvent(state, 'sickness', 'development', p.id)) {
      if (p.stock.medicine >= 1) p.stock.medicine--;
      else p.sick = true;
    }
    p.devSeconds = DEVELOPMENT.fullSeconds;
    p.doneDeveloping = false;
    p.installedThisTurn = false;
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
  requireLed(p);
  // With the arcade on, a fitted MULE changes good only by RE-OUTFIT (AM-2), never by a full-price re-fit.
  if (DEV_STEER.on && p.carriedMule !== 'empty') throw new RuleError('This MULE is outfitted: re-outfit it');
  const cost = outfitCostFor(state, playerId, outfit);
  if (p.money < cost) throw new RuleError('Not enough money');
  p.money -= cost;
  state.store.capital += cost;
  p.carriedMule = outfit;
}

export function installMule(state: GameState, playerId: string, x: number, y: number): void {
  const p = developer(state, playerId);
  if (!p.carriedMule || p.carriedMule === 'empty') throw new RuleError('The MULE is not outfitted');
  requireLed(p);
  const tile = plotAt(state, x, y);
  if (tile.owner !== playerId) throw new RuleError('Not your plot');
  // Installing over an existing MULE replaces it; the old one runs away, as in the original.
  if (tile.outfit !== p.carriedMule) tile.runMonths = 0;
  // A MULE taken off this plot this turn and put back with the same outfit, by any route, keeps the plot's run
  // from before the first take (AM-2: nothing lost; review F3: nor wiped by a hop through another plot).
  const before = p.takenRuns?.find((r) => r.x === x && r.y === y);
  if (before && before.outfit === p.carriedMule) tile.runMonths = before.runMonths;
  tile.outfit = p.carriedMule;
  p.carriedMule = null;
  delete p.takenMule;
  p.installedThisTurn = true;
}

// --- Re-outfitting (arcade spec AM-2): take a MULE off a plot, fit it for another good, install it again --------

/** Takes the MULE off one of your plots onto your lead: the plot makes nothing until a MULE is installed on it again. */
export function takeMule(state: GameState, playerId: string, x: number, y: number): void {
  const p = developer(state, playerId);
  if (p.carriedMule) throw new RuleError('Already leading a MULE');
  const tile = plotAt(state, x, y);
  if (tile.owner !== playerId) throw new RuleError('Not your plot');
  if (!tile.outfit) throw new RuleError('No MULE on this plot');
  p.takenMule = { x, y, outfit: tile.outfit, runMonths: tile.runMonths };
  if (!p.takenRuns?.some((r) => r.x === x && r.y === y)) p.takenRuns = [...(p.takenRuns ?? []), p.takenMule];
  p.carriedMule = tile.outfit;
  // The plot's run is left as it was: every way a MULE lands on it again sets the run (installMule, returnTakenMule).
  tile.outfit = null;
}

/** What this player pays to re-outfit a MULE for `outfit`: DEV_STEER.reoutfitCost of the outfitter's price. */
export function reoutfitCostFor(state: GameState, playerId: string, outfit: Outfit): number {
  return Math.round(outfitCostFor(state, playerId, outfit) * DEV_STEER.reoutfitCost);
}

/**
 * Fits a MULE taken off a plot this turn for another good, at an outfitter. The same good is refused, and so is a MULE
 * bought this turn (AM-14): its outfit is chosen once, at OUTFIT.
 */
export function reoutfitMule(state: GameState, playerId: string, outfit: Outfit): void {
  const p = developer(state, playerId);
  if (!p.carriedMule) throw new RuleError('No MULE to re-outfit');
  if (p.carriedMule === 'empty') throw new RuleError('This MULE is not outfitted yet: outfit it');
  if (!p.takenMule) throw new RuleError('Only a MULE taken off a plot can be re-outfitted');
  requireLed(p);
  if (p.carriedMule === outfit) throw new RuleError('The MULE is already outfitted for that');
  const cost = reoutfitCostFor(state, playerId, outfit);
  if (p.money < cost) throw new RuleError('Not enough money');
  p.money -= cost;
  state.store.capital += cost;
  p.carriedMule = outfit;
}

/** The turn ends with a taken MULE still carried: it goes back to its plot with the outfit and run it had there. */
function returnTakenMule(state: GameState, p: Player): void {
  const taken = p.takenMule;
  if (!taken) return;
  const tile = plotAt(state, taken.x, taken.y);
  tile.outfit = taken.outfit;
  tile.runMonths = taken.runMonths;
  p.carriedMule = null;
  delete p.takenMule;
}

// --- Development's moments (arcade spec C4): the floor's wolves and glint pay out through these -------------

/** Sells pelts at the store, which pays WOLVES.peltPrice each from its capital. Returns the credits paid. */
export function sellPelts(state: GameState, playerId: string, pelts: number): number {
  const p = developer(state, playerId);
  if (!Number.isInteger(pelts) || pelts < 1) throw new RuleError('No pelts to sell');
  const price = pelts * WOLVES.peltPrice;
  p.money += price;
  state.store.capital -= price;
  return price;
}

/** The glint's prize to the first colonist onto it: GLINT.crystite Crystite, or GLINT.credits when GLINT.prize says so. */
export function awardGlint(state: GameState, playerId: string): { prize: 'crystite' | 'credits'; amount: number } {
  const p = developer(state, playerId);
  if (GLINT.prize === 'credits') {
    p.money += GLINT.credits;
    return { prize: 'credits', amount: GLINT.credits };
  }
  p.stock.crystite += GLINT.crystite;
  return { prize: 'crystite', amount: GLINT.crystite };
}

/** A lost wolf fight: the MULE on the player's lead bolts. It stays theirs, and leads again once caught. */
export function boltMule(state: GameState, playerId: string): void {
  const p = developer(state, playerId);
  if (!p.carriedMule) throw new RuleError('No MULE to bolt');
  if (p.muleBolted) throw new RuleError('Your MULE has already bolted');
  p.muleBolted = true;
}

/** Catches the player's bolted MULE, which leads again. */
export function catchMule(state: GameState, playerId: string): void {
  const p = developer(state, playerId);
  if (!p.muleBolted) throw new RuleError('Your MULE has not bolted');
  delete p.muleBolted;
}

function requireLed(p: Player): void {
  if (p.muleBolted) throw new RuleError('Your MULE bolted: catch it first');
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
 * What the pub would pay a player with `secondsLeft` of their development time: more the earlier they go. Changes
 * nothing, and refuses whom the pub would refuse.
 */
export function pubPayoutFor(state: GameState, playerId: string, secondsLeft: number): number {
  const p = developer(state, playerId);
  const share = Math.min(1, Math.max(0, secondsLeft / p.devSeconds));
  const { base, start, perMonth } = DEVELOPMENT.pub;
  return Math.round(base + (start + state.month * perMonth) * share);
}

/**
 * The pub ends your development turn and pays cash: more the more time you
 * have left, and more later in the game. A MULE you were leading runs off,
 * but one taken off your plot goes back to it (AM-2).
 * The server says how many seconds the player had left. Returns the payout.
 */
export function visitPub(state: GameState, playerId: string, secondsLeft: number): number {
  const p = developer(state, playerId);
  const payout = pubPayoutFor(state, playerId, secondsLeft);
  p.money += payout;
  returnTakenMule(state, p);
  p.carriedMule = null;
  delete p.muleBolted;
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
      p.doneWithLand = false;
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
    // A MULE nobody installed runs away at the end of development; one taken off a plot goes back to it (AM-2).
    for (const p of state.players) {
      returnTakenMule(state, p);
      p.carriedMule = null;
      delete p.takenRuns;
      delete p.muleBolted;
    }
    const price = mulePrice(state);
    const soldOut = state.store.mules === 0;
    // MULEs get dearer each month the corral sells out, and cheaper when they are left over.
    if (soldOut) state.store.muleFactor *= 1 + MULE.scarcityUp;
    else if (state.store.mules >= state.store.mulesAtStart * MULE.surplusShare) state.store.muleFactor = Math.max(MULE.minFactor, state.store.muleFactor * (1 - MULE.surplusDown));
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
  /** Points for terms served (POLITICS.termScore each), before any Collapse cut. 0 with politics off. */
  office: number;
  /** What Collapse took off every line, office included: 0 unless the colony failed. */
  cut: number;
  total: number;
}

/**
 * A final score line by line: money, goods at today's colony prices, land,
 * installed MULEs at the store price, terms in office, and the Collapse cut on all of them.
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
  // Outside Collapse the office line joins after the rounding, so it moves no existing total.
  const office = officeScore(state, playerId);
  const total = colonyFailed(state) ? Math.round((raw + office) * POLLUTION.collapseScore) : before + office;
  const money = Math.round(p.money);
  return { money, goods: before - money - land - muleValue, plots, land, mules, muleValue, office, cut: before + office - total, total };
}

/** Final score: scoreParts().total. */
export function score(state: GameState, playerId: string): number {
  return scoreParts(state, playerId).total;
}
