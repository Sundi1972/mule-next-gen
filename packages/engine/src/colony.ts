/**
 * The colony as a shared project: the colony fund's ledger, every write to the fund, and the prestige objects the
 * Governor commissions. The only writer of GameState.colony and, through fundIn and fundOut, of treasury.money.
 * With politics off there is no colony, and the fund moves exactly as it always has, with no ledger.
 */
import { COLONY, PRESTIGE } from './config.js';
import { storeForSale, storeQuotes } from './economy.js';
import { RuleError } from './errors.js';
import type { Colony, FundLedger, FundLine, FundSource, GameState, Good, PrestigeId, Project } from './types.js';

/** The colony at the start of a game played with politics. */
export function newColony(month: number): Colony {
  return { ledger: emptyLedger(month), projects: [], promises: [], permanentPrestige: 0 };
}

function emptyLedger(month: number): FundLedger {
  return { month, in: {}, out: {} };
}

/** A what-if copy may share the colony, so every write copies it first; a new month's first write starts a fresh ledger. */
function edit(state: GameState): Colony {
  const colony = structuredClone(state.colony!);
  if (colony.ledger.month !== state.month) colony.ledger = emptyLedger(state.month);
  state.colony = colony;
  return colony;
}

/** Puts money into the colony fund, recorded under where it came from. */
export function fundIn(state: GameState, source: FundSource, amount: number): void {
  state.treasury.money += amount;
  if (!state.colony || amount === 0) return;
  const ledger = edit(state).ledger;
  ledger.in[source] = (ledger.in[source] ?? 0) + amount;
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

/** fundOut on a colony this call has already copied. */
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
  const election = state.politics?.election;
  if (state.phase !== 'planning' || (election && election.stage !== 'over')) throw new RuleError(`${act} once the votes are over`);
  if (state.politics?.governor !== playerId) throw new RuleError(`Only the Governor ${act.toLowerCase()}s for the colony`);
  return state.colony;
}

/** The Governor commissions a prestige object; the fund and donors pay for it from the next upkeep. See G-5 RULE-22. */
export function commission(state: GameState, playerId: string, id: PrestigeId): void {
  const colony = governorActs(state, playerId, 'Commission');
  if (!Object.hasOwn(PRESTIGE, id)) throw new RuleError("The colony can't build that");
  if (colony.projects.some((p) => p.id === id)) throw new RuleError(`The colony already has a ${PRESTIGE[id].name}`);
  const open = colony.projects.filter((p) => OPEN.includes(p.stage));
  if (open.length >= COLONY.maxOpen) throw new RuleError(`The colony is already building the ${PRESTIGE[open[0]!.id].name}`);
  edit(state).projects.push({ id, stage: 'commissioned', funded: { credits: 0, goods: {} }, monthsLeft: null, plot: null, since: state.month, plaque: {} });
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

/** At upkeep, after the offices are paid: objects pay their upkeep, buildings go up, and the open project is funded. See G-5 RULE-21. */
export function runColony(state: GameState): void {
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
  const open = colony.projects.find((p) => p.stage === 'commissioned');
  if (open) fund(state, colony, open);
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
  const sited = !PRESTIGE[project.id].needsPlot || project.plot !== null;
  if (funded && sited) Object.assign(project, { stage: 'building', monthsLeft: PRESTIGE[project.id].buildMonths });
}
