/**
 * The colony as a shared project: the colony fund's ledger, every write to the fund, and the prestige objects the
 * Governor commissions. The only writer of GameState.colony and, through fundIn and fundOut, of treasury.money.
 * With politics off there is no colony, and the fund moves exactly as it always has, with no ledger.
 */
import { COLONY, GAME, HAPPINESS, HEALTH, PRESTIGE } from './config.js';
import { allPrices, storeForSale, storeQuotes } from './economy.js';
import { RuleError } from './errors.js';
import { votesOpen } from './politics.js';
import { PERCENT } from './units.js';
import { scoreParts } from './game.js';
import { GOODS, type Colony, type ColonyGauges, type FundLedger, type FundLine, type FundSource, type GameState, type Good, type MoodBand, type PrestigeId, type Project } from './types.js';

/** The colony at the start of a game played with politics. */
export function newColony(month: number): Colony {
  return { ledger: emptyLedger(month), projects: [], promises: [], permanentPrestige: 0, monthEnds: [], happiness: HAPPINESS.start, strike: null, welfare: null };
}

function emptyLedger(month: number): FundLedger {
  return { month, in: {}, out: {} };
}

/** Each what-if copy's own colony, made at its first write: it shares the colony of the state it was made from. */
const owned = new WeakMap<GameState, Colony>();

/**
 * The state's own colony to write to; a new month's first write starts a fresh ledger. The real game copies on every
 * write, since a what-if made from it may still hold the old object; a what-if copies once and then writes its own,
 * which keeps its many simulated sales cheap.
 */
function edit(state: GameState): Colony {
  let colony = state.colony!;
  if (!state.whatIf || owned.get(state) !== colony) {
    colony = structuredClone(colony);
    owned.set(state, colony);
    state.colony = colony;
  }
  if (colony.ledger.month !== state.month) colony.ledger = emptyLedger(state.month);
  return colony;
}

/** Puts money into the colony fund, recorded under where it came from. */
export function fundIn(state: GameState, source: FundSource, amount: number): void {
  if (state.colony && amount !== 0) payIn(state, edit(state), source, amount);
  else state.treasury.money += amount;
}

/** fundIn on a colony this call already holds for writing. */
function payIn(state: GameState, colony: Colony, source: FundSource, amount: number): void {
  state.treasury.money += amount;
  colony.ledger.in[source] = (colony.ledger.in[source] ?? 0) + amount;
}

/** Pays out of the colony fund as far as it reaches, never below 0, recorded under what it paid for. Returns what it paid. */
export function fundOut(state: GameState, line: FundLine, amount: number): number {
  return state.colony ? payOut(state, edit(state), line, amount) : take(state, amount);
}

function take(state: GameState, amount: number): number {
  const paid = Math.max(0, Math.min(state.treasury.money, amount));
  state.treasury.money -= paid;
  return paid;
}

/** fundOut on a colony this call already holds for writing. */
function payOut(state: GameState, colony: Colony, line: FundLine, amount: number): number {
  const paid = take(state, amount);
  if (paid > 0) colony.ledger.out[line] = (colony.ledger.out[line] ?? 0) + paid;
  return paid;
}

/** This month's ledger for the month report: empty when nothing moved; undefined without a colony. */
export function monthLedger(state: GameState): FundLedger | undefined {
  if (!state.colony) return undefined;
  const { ledger } = state.colony;
  return ledger.month === state.month ? structuredClone(ledger) : emptyLedger(state.month);
}

/** At upkeep, before the offices are paid: the Federation's grant into the fund. */
export function payGrant(state: GameState): void {
  if (state.colony) fundIn(state, 'grant', COLONY.grant.perMonth);
}

/** The colony's prestige: its standing objects' and its permanent points. A closed or damaged object counts 0. */
export function colonyPrestige(state: GameState): number {
  if (!state.colony) return 0;
  const standing = state.colony.projects.filter((p) => p.stage === 'standing');
  return state.colony.permanentPrestige + standing.reduce((sum, p) => sum + PRESTIGE[p.id].prestige, 0);
}

/** The credits and goods a project still needs before it can be built. */
export function stillNeeds(project: Project): { credits: number; goods: Partial<Record<Good, number>> } {
  const row = PRESTIGE[project.id];
  const goods: Partial<Record<Good, number>> = {};
  for (const [good, units] of Object.entries(row.goods) as [Good, number][]) {
    const left = units - (project.funded.goods[good] ?? 0);
    if (left > 0) goods[good] = left;
  }
  return { credits: row.credits - project.funded.credits, goods };
}

const OPEN: readonly Project['stage'][] = ['commissioned', 'building'];

/** The Governor's acts for the colony: planning only, once no vote is open. */
function governorActs(state: GameState, playerId: string, act: string): Colony {
  if (!state.colony) throw new RuleError("This game plays without the colony's council");
  if (state.phase !== 'planning' || votesOpen(state)) throw new RuleError(`${act} once the votes are over`);
  if (state.politics?.governor !== playerId) throw new RuleError(`Only the Governor ${act.toLowerCase()}s for the colony`);
  return state.colony;
}

/**
 * The Governor commissions a prestige object; the fund and donors pay for it from the next upkeep. It takes the first
 * free block of its footprint on the colony's grounds. See G-5 RULE-22, RULE-32b.
 */
export function commission(state: GameState, playerId: string, id: PrestigeId): void {
  governorActs(state, playerId, 'Commission');
  const refused = objectRefusal(state, id);
  if (refused) throw new RuleError(refused);
  const slot = firstFreeBlock(state, id);
  if (slot === null) throw new RuleError(noRoom(id));
  edit(state).projects.push({ id, stage: 'commissioned', funded: { credits: 0, goods: {} }, monthsLeft: null, since: state.month, plaque: {}, slot });
}

const noRoom = (id: PrestigeId) => `There is no room on the colony's grounds for the ${PRESTIGE[id].name}`;

/** A block on the colony's grounds: its top-left cell and its size, in cells. */
export interface GroundsPlace {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A project's block on the grounds, from its slot (the top-left cell, y × size + x) and its footprint; null holds none. */
export function groundsPlace(project: Pick<Project, 'id' | 'slot'>): GroundsPlace | null {
  const { slot } = project;
  if (slot === null || slot === undefined) return null;
  const { size } = COLONY.grounds;
  return { x: slot % size, y: Math.floor(slot / size), ...PRESTIGE[project.id].footprint };
}

/** The cells a block covers, as slots. */
function cellsOf({ x, y, w, h }: GroundsPlace): number[] {
  const { size } = COLONY.grounds;
  const cells: number[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push((y + dy) * size + x + dx);
  return cells;
}

/**
 * Every w × h block on the grounds that leaves the town hall's centre cell free, in RULE-32b's order: the ring (the
 * Chebyshev distance from the hall) of its farthest cell, then of its nearest, then clockwise from north by its
 * centre. The last two keys only make the order total; with a square grounds no two blocks tie before them.
 */
function blocksInOrder(w: number, h: number): GroundsPlace[] {
  const { size } = COLONY.grounds;
  // literal-ok: geometry, not balance: the hall is the middle cell of the square
  const hall = Math.floor(size / 2);
  const ring = (cell: number) => Math.max(Math.abs((cell % size) - hall), Math.abs(Math.floor(cell / size) - hall));
  const blocks: { place: GroundsPlace; far: number; near: number; turn: number }[] = [];
  for (let y = 0; y + h <= size; y++) {
    for (let x = 0; x + w <= size; x++) {
      const place = { x, y, w, h };
      const rings = cellsOf(place).map(ring);
      if (rings.includes(0)) continue;
      // Clockwise from north: the angle from straight up, 0 to 2π, of the block's centre seen from the hall's centre.
      // literal-ok: geometry, not balance: a block's centre is half its size in, a cell's centre half a cell in
      const turn = Math.atan2(x + w / 2 - (hall + 0.5), -(y + h / 2 - (hall + 0.5)));
      // literal-ok: geometry, not balance: a full turn is 2π
      blocks.push({ place, far: Math.max(...rings), near: Math.min(...rings), turn: turn < 0 ? turn + 2 * Math.PI : turn });
    }
  }
  blocks.sort((a, b) => a.far - b.far || a.near - b.near || a.turn - b.turn || a.place.y - b.place.y || a.place.x - b.place.x);
  return blocks.map((b) => b.place);
}

/**
 * The slot of the first free block for this object's footprint (G-5 RULE-32b), or null when none is free. Every project
 * holding a block keeps all its cells, whatever its stage, closed and damaged ones too. No rule reads the position.
 */
function firstFreeBlock(state: GameState, id: PrestigeId): number | null {
  const taken = new Set(
    state.colony!.projects.flatMap((p) => {
      const place = groundsPlace(p);
      return place ? cellsOf(place) : [];
    }),
  );
  const { w, h } = PRESTIGE[id].footprint;
  const free = blocksInOrder(w, h).find((b) => cellsOf(b).every((cell) => !taken.has(cell)));
  return free ? free.y * COLONY.grounds.size + free.x : null;
}

/** Why the colony can't take on this object now, whoever asks (RULE-22 rows 4-6), or null. */
function objectRefusal(state: GameState, id: PrestigeId): string | null {
  if (!Object.hasOwn(PRESTIGE, id)) return "The colony can't build that";
  const projects = state.colony!.projects;
  const { name } = PRESTIGE[id];
  if (projects.some((p) => p.id === id)) return `The colony already has ${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
  const open = projects.filter((p) => OPEN.includes(p.stage));
  return open.length >= COLONY.maxOpen ? `The colony already has ${open.length} ${open.length === 1 ? 'building' : 'buildings'} under way` : null;
}

/** Why the sitting Governor could not commission this object now, or null when they could: every screen's catalogue reads it. */
export function commissionRefusal(state: GameState, id: PrestigeId): string | null {
  const governor = state.politics?.governor;
  if (!state.colony) return "This game plays without the colony's council";
  if (!governor) return 'The colony has no Governor yet';
  try {
    governorActs(state, governor, 'Commission');
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return objectRefusal(state, id) ?? (firstFreeBlock(state, id) === null ? noRoom(id) : null);
}

/** The Governor pays to repair a damaged object from the fund. See G-5 RULE-21. */
export function repair(state: GameState, playerId: string, id: PrestigeId): void {
  const found = governorActs(state, playerId, 'Repair').projects.find((p) => p.id === id);
  if (!found || found.stage !== 'damaged') throw new RuleError(`The ${PRESTIGE[id]?.name ?? id} isn't damaged`);
  const { repairCost } = PRESTIGE[id];
  if (state.treasury.money < repairCost) throw new RuleError(`The fund has ${state.treasury.money} cr; the repair costs ${repairCost} cr`);
  const colony = edit(state);
  payOut(state, colony, 'repair', repairCost);
  colony.projects.find((p) => p.id === id)!.stage = 'standing';
}

/** At upkeep, after the offices are paid: objects pay their upkeep, buildings go up, and every project being paid for is funded, oldest first. See G-5 RULE-21. */
export function runColony(state: GameState, shortages: readonly Good[]): void {
  if (!state.colony) return;
  const colony = edit(state);
  for (const p of colony.projects) {
    if (p.stage !== 'standing' && p.stage !== 'closed') continue;
    const { upkeep } = PRESTIGE[p.id];
    p.stage = state.treasury.money >= upkeep ? 'standing' : 'closed';
    if (p.stage === 'standing') payOut(state, colony, 'upkeep', upkeep);
  }
  for (const p of colony.projects) {
    if (p.stage !== 'building') continue;
    p.monthsLeft = p.monthsLeft! - 1;
    if (p.monthsLeft === 0) Object.assign(p, { stage: 'standing', monthsLeft: null });
  }
  // Every project still being paid for, in the order it was commissioned: one paid in credits but waiting for its goods
  // takes no credits, so it never starves the ones behind it. fund() keeps the reserve across all of them, and starts
  // every one that has all its credits and goods; no building waits for land (C48) (RULE-21 row 4).
  for (const p of colony.projects.filter((p) => p.stage === 'commissioned')) fund(state, colony, p);
  colony.happiness = moodStep(colony.happiness, moodTarget(moodInputs(state, shortages)));
  // literal-ok: the last two month ends, the window lastGauges reads (this month's and the one before)
  colony.monthEnds = [...colony.monthEnds, colonyGauges(state)].slice(-2);
}

/**
 * The colony's wealth: the fund and every player's money, goods, land and MULEs, as their scores count them, before
 * the office line and any Collapse cut.
 */
export function colonyWealth(state: GameState): number {
  return state.players.reduce((sum, p) => {
    const { money, goods, land, muleValue } = scoreParts(state, p.id);
    return sum + money + goods + land + muleValue;
  }, state.treasury.money);
}

/** The colony's gauges now. */
export function colonyGauges(state: GameState): ColonyGauges {
  return { month: state.month, wealth: colonyWealth(state), prestige: colonyPrestige(state), happiness: state.colony?.happiness ?? null, air: state.air };
}

/** Last month's gauges for the "this month" change: the latest month end before this month's, or null in month 1. */
export function lastGauges(state: GameState): ColonyGauges | null {
  const before = state.colony?.monthEnds.filter((g) => g.month < state.month) ?? [];
  return before.at(-1) ?? null;
}

/** What the fund can spend on a project: everything above the reserve it keeps for office pay. */
function spare(state: GameState): number {
  return Math.max(0, state.treasury.money - COLONY.reserve);
}

function fund(state: GameState, colony: Colony, project: Project): void {
  project.funded.credits += payOut(state, colony, 'project', Math.min(stillNeeds(project).credits, spare(state)));
  if (COLONY.fundBuysGoods) {
    for (const [good, missing] of Object.entries(stillNeeds(project).goods) as [Good, number][]) {
      const price = storeQuotes(state, good).sell;
      if (price === null) continue;
      const units = Math.min(missing, storeForSale(state, good), Math.floor(spare(state) / price));
      if (units <= 0) continue;
      payOut(state, colony, 'project', units * price);
      state.store.stock[good] -= units;
      state.store.capital += units * price;
      project.funded.goods[good] = (project.funded.goods[good] ?? 0) + units;
    }
  }
  const needs = stillNeeds(project);
  const funded = needs.credits === 0 && Object.keys(needs.goods).length === 0;
  // RULE-21 row 4: fully funded, it builds. Its place on the colony's grounds is its own from the commission (C48).
  if (funded) Object.assign(project, { stage: 'building', monthsLeft: PRESTIGE[project.id].buildMonths });
}

/** A good's key as words for a message: rareEarth reads "rare earth". */
export function goodWords(good: Good): string {
  return good.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
}

const whole = (n: number) => Number.isInteger(n) && n >= 0;

/** A player gives credits and goods toward the object being funded; the plaque and their vote weight count it. See G-5 RULE-23. */
export function donate(state: GameState, playerId: string, id: PrestigeId, credits: number, goods: Partial<Record<Good, number>> = {}): void {
  if (!state.colony) throw new RuleError("This game plays without the colony's council");
  if (state.phase !== 'planning') throw new RuleError('Donate in planning');
  const project = state.colony.projects.find((p) => p.id === id && p.stage === 'commissioned');
  if (!project) throw new RuleError('Nothing is being funded');
  const given = Object.entries(goods) as [Good, number][];
  if (given.some(([good]) => !GOODS.includes(good))) throw new RuleError('That is not a good');
  if (!whole(credits) || !given.every(([, units]) => whole(units)) || credits + given.reduce((sum, [, units]) => sum + units, 0) === 0) {
    throw new RuleError('Give at least 1 cr or 1 unit');
  }
  const donor = state.players.find((p) => p.id === playerId);
  if (!donor) throw new RuleError('No such player');
  if (credits > donor.money) throw new RuleError(`You have ${donor.money} cr`);
  const { name } = PRESTIGE[id];
  const needs = stillNeeds(project);
  if (credits > needs.credits) throw new RuleError(`The ${name} needs only ${needs.credits} cr more`);
  for (const [good, units] of given) {
    if (units === 0) continue;
    const missing = Object.hasOwn(needs.goods, good) ? needs.goods[good]! : undefined;
    if (missing === undefined) throw new RuleError(`The ${name} needs no ${goodWords(good)}`);
    if (units > missing) throw new RuleError(`The ${name} still needs ${missing} ${goodWords(good)}`);
    if (units > donor.stock[good]) throw new RuleError(`You have ${donor.stock[good]} ${goodWords(good)}`);
  }

  const colony = edit(state);
  const target = colony.projects.find((p) => p.id === id)!;
  donor.money -= credits;
  payIn(state, colony, 'donation', credits);
  target.funded.credits += payOut(state, colony, 'project', credits);
  // Goods count at the store's price on the day, the price Worth values them at, so a gift is Worth-neutral (AM-13).
  const prices = allPrices(state);
  let value = credits;
  for (const [good, units] of given) {
    if (units === 0) continue;
    donor.stock[good] -= units;
    target.funded.goods[good] = (target.funded.goods[good] ?? 0) + units;
    value += units * prices[good];
  }
  target.plaque[playerId] = (target.plaque[playerId] ?? 0) + value;
  state.treasury.paid[playerId] = (state.treasury.paid[playerId] ?? 0) + value;
}

/**
 * At planning's close, before an election still open is closed: whether the sitting Governor's tax promise held this
 * month. Nothing is recorded while the election is open, since the Governor could not set the tax. See G-5 RULE-24.
 */
export function keepPromise(state: GameState): void {
  const politics = state.politics;
  if (!state.colony || !politics?.governor || !politics.promise || politics.promiseFrom === null) return;
  if (politics.election && politics.election.stage !== 'over') return;
  const tax = Math.round(state.treasury.salesTax * PERCENT);
  const { promise, promiseFrom: from } = politics;
  const kept = promise.kind === 'cap' ? tax <= promise.percent : promise.kind === 'lower' ? tax < from : tax === from;
  edit(state).promises.push({ month: state.month, governor: politics.governor, kind: promise.kind, kept });
}

/** What a month's mood target reads. See G-5 RULE-20. */
export interface MoodInputs {
  /** Goods the store ran short of this upkeep. */
  short: number;
  /** The air gauge, 0..100, higher is dirtier. */
  air: number;
  /** The sales tax in whole percent. */
  tax: number;
  /** 1 in a month the Governor broke their tax promise. */
  broken: 0 | 1;
  /** Prestige standing, objects and permanent. */
  prestige: number;
  /** Credits between the richest and poorest player, by cash and land. */
  gap: number;
  /** HEALTH prototype: the sick share, and whether the colonists' Electronics were met. */
  sick?: number;
  electronics?: number;
}

/** The month's inputs. `shortages` are this upkeep's, which the month's report only receives once upkeep is done. */
export function moodInputs(state: GameState, shortages: readonly Good[]): MoodInputs {
  const brokeNow = state.colony?.promises.some((p) => p.month === state.month && !p.kept) ?? false;
  return {
    short: shortages.filter((g) => g !== 'medicine' && g !== 'electronics').length,
    sick: HEALTH.mode !== 'base' ? (state.health?.h ?? 0) : 0,
    electronics: HEALTH.mode === 'healthE' ? (state.health?.eShare ?? 0) : 0,
    air: state.air,
    tax: Math.round(state.treasury.salesTax * PERCENT),
    broken: brokeNow ? 1 : 0,
    prestige: colonyPrestige(state),
    gap: wealthGap(state),
  };
}

/** The mood a month aims for, 0..100. See G-5 RULE-20. */
export function moodTarget(i: MoodInputs): number {
  const w = HAPPINESS.weights;
  const target =
    HAPPINESS.base -
    w.shortage * i.short -
    w.air * Math.max(0, i.air - w.airFree) -
    w.tax * Math.max(0, i.tax - w.taxFree) -
    w.broken * i.broken +
    w.prestige * Math.min(i.prestige, w.prestigeCap) -
    w.gap * Math.min(i.gap / w.gapUnit, w.gapCap) -
    HEALTH.moodAtMax * ((i.sick ?? 0) / HEALTH.max) +
    HEALTH.electronicsBonus * (i.electronics ?? 0);
  return clampMood(target);
}

/** One month's move from `h` toward `target`, at most HAPPINESS.maxStep, as a whole number. */
export function moodStep(h: number, target: number): number {
  const step = Math.max(-HAPPINESS.maxStep, Math.min(HAPPINESS.maxStep, target - h));
  return clampMood(Math.round(h + step));
}

function clampMood(h: number): number {
  return Math.max(0, Math.min(100, h)); // literal-ok: the mood's scale is 0..100 by definition (G-5 RULE-20)
}

/** An event's change to the mood, at once and uncapped; the only writer of happiness besides the monthly drift. */
export function moodShift(state: GameState, delta: number): void {
  if (!state.colony) return;
  const colony = edit(state);
  colony.happiness = clampMood(Math.round(colony.happiness + delta));
}

/** An event's lasting prestige (a festival's points, G-5 C26), whole points; colonyPrestige counts them. */
export function addPrestige(state: GameState, points: number): void {
  if (!state.colony) return;
  edit(state).permanentPrestige += Math.round(points);
}

/** A riot damages a standing object (G-5 C26, RULE-21): it counts 0 prestige until repaired. Returns whether it did. */
export function damageObject(state: GameState, id: PrestigeId): boolean {
  if (state.colony?.projects.find((p) => p.id === id)?.stage !== 'standing') return false;
  edit(state).projects.find((p) => p.id === id)!.stage = 'damaged';
  return true;
}

/** The band a mood falls in. */
export function moodBand(h: number): MoodBand {
  const { bands } = HAPPINESS;
  if (h >= bands.thriving) return 'thriving';
  if (h >= bands.content) return 'content';
  if (h >= bands.restless) return 'restless';
  if (h >= bands.unhappy) return 'unhappy';
  return 'unrest';
}

/** Credits between the richest and the poorest player, by cash and land: the one measure the mood and migration share. */
export function wealthGap(state: GameState): number {
  const worth = state.players.map((p) => p.money + state.tiles.filter((t) => t.owner === p.id).length * GAME.plotScore);
  return worth.length === 0 ? 0 : Math.max(...worth) - Math.min(...worth);
}

/** A general strike on `good` starts this month; WS1's strike event calls it. See G-5 RULE-26. */
export function callStrike(state: GameState, good: Good): void {
  if (!state.colony) return;
  edit(state).strike = { month: state.month, good, cost: COLONY.strike.cost, paid: false };
}

/** Whether this month's strike holds `good` back: production makes a fraction of it while the strikers are unpaid. */
export function strikeHolds(state: GameState, good: Good): boolean {
  const strike = state.colony?.strike;
  return !!strike && strike.month === state.month && strike.good === good && !strike.paid;
}

/** The Governor pays this month's strikers from the fund; the reserve does not hold back. See G-5 RULE-26. */
export function payStrike(state: GameState, playerId: string): void {
  if (!state.colony) throw new RuleError("This game plays without the colony's council");
  const strike = state.colony.strike;
  if (!strike || strike.month !== state.month) throw new RuleError('There is no strike to pay off');
  if (state.phase !== 'planning' || votesOpen(state)) throw new RuleError('Pay the strikers once the votes are over');
  if (state.politics?.governor !== playerId) throw new RuleError('Only the Governor pays the strikers');
  if (strike.paid) throw new RuleError('The strikers are already paid');
  if (state.treasury.money < strike.cost) throw new RuleError(`The fund has ${state.treasury.money} cr; the strikers want ${strike.cost} cr`);
  const colony = edit(state);
  payOut(state, colony, 'strikePay', strike.cost);
  colony.strike = { ...strike, paid: true };
}
