/**
 * What politics is worth to a seat, in credits: the values WS7's hands (deal cards, sabotage and the Sheriff, the
 * Governor's budget and overrule) decide with. The signatures were agreed with WS7 on 7 Nov; the hands build against
 * them now and each body follows its slice's design.
 *
 * Every function is pure and reads only `obs`, the seat's own `observe(state, me)`: never raw state, never the seed,
 * never a rival's secret order (HC-4). Nothing draws. Where the engine itself draws (capture), the engine exports the
 * odds and these values read it, so its formula exists once.
 *
 * Slice 4's values and lawWorth are real (S4-PR-3). Slices 3 and 5 are STUBS until their designs: every value is 0 and
 * trust is a coin's even chance; captureCost's reputation part follows reputationCost when slice 3 fills it.
 */
import {
  auctionNeed,
  banMultiplier,
  budgetCredits,
  COLONY,
  colonyPrestige,
  GOODS,
  HAPPINESS,
  PRESTIGE,
  stillNeeds,
  storeForSale,
  storeQuotes,
  welfareRecipient,
  isPublicOrder,
  lawImpact,
  orderTerms,
  pactBetween,
  POLITICS,
  score,
  type BudgetLine,
  type DealCard,
  type GameState,
  type Good,
  type LawProposal,
  type OverruleTarget,
  type SabotageOrder,
} from '@mule/engine';
import { endMonth } from './outlook.js';
import { yieldOf } from './value.js';

// Slice 3: deal cards.

/** What `card` is worth to `me` over its term: what it gets minus what it gives. To the other party: cardWorth(obs, them, card). */
export function cardWorth(_obs: GameState, _me: string, _card: DealCard): number {
  return 0;
}

/** The chance, 0 to 1, that `proposer` keeps a card it offers `me`: from its reputation and the cards it broke. */
export function trust(_obs: GameState, _me: string, _proposer: string): number {
  return 0.5; // literal-ok: stub, an even chance until slice 3's design names the trust rule
}

/** What a reputation change of `delta` costs `me` over the months left (votes, cards offered, score); a loss is positive. */
export function reputationCost(_obs: GameState, _me: string, _delta: number): number {
  return 0;
}

/** What breaking `card` now gains `me`, before the reputation it costs (weighed against reputationCost). */
export function breakGain(_obs: GameState, _me: string, _card: DealCard): number {
  return 0;
}

// Slice 4: sabotage and the Sheriff (spec §10, S4-C11). Every value is in credits and reads public facts at the posted
// prices: the hands call them for every candidate a month, so none rolls the game forward.

/** What tile `tile` makes this month at the posted price: 0 for an empty or unfitted plot. */
function plotWorth(obs: GameState, tile: number): number {
  const t = obs.tiles[tile];
  if (!t?.owner || !t.outfit || t.outfit === 'greenBelt') return 0;
  return yieldOf(obs, t, t.outfit, t.owner).made * obs.store.posted[t.outfit];
}

/** The strongest seat but `me` on Worth (score): the rival a rumour is weighed against. */
function strongestRival(obs: GameState, me: string): string | null {
  let best: string | null = null;
  for (const p of obs.players) if (p.id !== me && (best === null || score(obs, p.id) > score(obs, best))) best = p.id;
  return best;
}

/** What `id` holds of `good` beyond what it must keep this month: positive sells at the auction, negative buys. */
function surplus(obs: GameState, id: string, good: Good): number {
  const p = obs.players.find((q) => q.id === id);
  return p ? p.stock[good] - auctionNeed(obs, id)[good] : 0;
}

/**
 * What `order` is expected to gain `me` on the table, before its crew and capture: already times the order's odds of
 * working (the hand's net applies none, S4-RULE-13's example). A power cut: the plot's output this month at the posted
 * price, in full against a victim ahead of `me` on Worth, POLITICS.ai.sabotage.behindWeight of it against one behind.
 * A rumour: the shift on `me`'s surplus of the good less the strongest rival's, so it may be negative (spec §10).
 */
export function sabotageGain(obs: GameState, me: string, order: SabotageOrder): number {
  const { orders } = POLITICS.sabotage;
  const target = order.target;
  if (target.kind === 'powerCut') {
    const victim = obs.tiles[target.tile]?.owner;
    if (!victim || victim === me) return 0;
    const weight = score(obs, victim) > score(obs, me) ? 1 : POLITICS.ai.sabotage.behindWeight;
    return orders.powerCut.success * plotWorth(obs, target.tile) * weight;
  }
  const rival = strongestRival(obs, me);
  const edge = surplus(obs, me, target.good) - (rival ? surplus(obs, rival, target.good) : 0);
  const sign = target.dir === 'up' ? 1 : -1;
  return orders.rumour.success * orders.rumour.shift * obs.store.posted[target.good] * edge * sign;
}

/**
 * What being caught at `order` would cost `me`, not weighted by the odds: the standard fine times the sabotage ban's
 * multiplier in force; the caught move times that multiplier, through reputationCost; and, when a pact binds `me` to
 * the victim this month, the pact's breach through reputationCost too (S4-RULE-13's net, so the hand makes no
 * separate pact check).
 */
export function captureCost(obs: GameState, me: string, order: SabotageOrder): number {
  const multiplier = banMultiplier(obs);
  const { moves } = POLITICS.reputation;
  const victim = order.target.kind === 'powerCut' ? obs.tiles[order.target.tile]?.owner : null;
  const pact = victim && victim !== me && pactBetween(obs, me, victim) !== null;
  const delta = moves.caught * multiplier + (pact ? moves.pactBroken : 0);
  return POLITICS.sheriff.fine.standard * multiplier + reputationCost(obs, me, delta);
}

/** The power cuts already public against `owner`: the record a Sheriff guards by. */
function casesAgainst(obs: GameState, owner: string): number {
  return (obs.politics?.sabotage ?? []).filter((o) => o.target.kind === 'powerCut' && o.victim === owner && isPublicOrder(o)).length;
}

/**
 * What a guard on tile `plot` is expected to save this month: the cut's damage there (its output at the posted price,
 * times the cut's odds of working) times how likely it is the target. From public facts only: a plot's owner is a
 * target to the seats behind it, in full, and to the seats ahead of it at behindWeight; each public cut against the
 * owner adds as much again, up to a sure target. The Sheriff's own plots count like anyone's.
 */
export function guardValue(obs: GameState, _me: string, plot: number): number {
  const owner = obs.tiles[plot]?.owner;
  const worth = plotWorth(obs, plot);
  if (!owner || worth <= 0) return 0;
  const others = obs.players.filter((p) => p.id !== owner);
  if (others.length === 0) return 0;
  const mine = score(obs, owner);
  const pull = others.reduce((sum, p) => sum + (score(obs, p.id) < mine ? 1 : POLITICS.ai.sabotage.behindWeight), 0) / others.length;
  const chance = Math.min(1, pull * (1 + casesAgainst(obs, owner)));
  return POLITICS.sabotage.orders.powerCut.success * worth * chance;
}

/**
 * What investigating `suspect`, a public order whose culprit is hidden, is worth to `me` as Sheriff: already times
 * POLITICS.sheriff.investigateOdds. A solved case pays the standard fine times the ban's multiplier: the victim's share
 * to `me` when the case was against `me`, and the fund's share, of which `me` counts an even part. 0 for a case whose
 * culprit is already known.
 */
export function investigateValue(obs: GameState, me: string, suspect: SabotageOrder): number {
  if (suspect.culpritPublic || suspect.by !== null) return 0;
  const { investigateOdds, victimShare, fine } = POLITICS.sheriff;
  const levied = fine.standard * banMultiplier(obs);
  const restitution = suspect.victim === me ? victimShare * levied : 0;
  const fundPart = ((1 - victimShare) * levied) / Math.max(1, obs.players.length);
  return investigateOdds * (restitution + fundPart);
}

// Every slice: laws.

/**
 * What `proposal` is worth to `me` a month: an enact is what the law at its setting gains `me` less what it costs; a
 * repeal is the negative of the law in force's worth (0 when it is not in force). Every law but the ban costs slice 2a
 * RULE-45's lawImpact and gains nothing. The sabotage ban (spec §10) gains the power cuts `me` suffered a month (the
 * public record, valued at today's output and prices) times the share it deters, 1 − 1/setting, since it multiplies
 * what a capture costs by the setting. It costs what it adds to the fines and reputation `me` expects for its own
 * orders: every past order of its own, caught or not (observe keeps them whole), a month, at its kind's odds of being
 * seen. lawImpact's preview counts only the revealed ones, which is all a phone may show (review of #770).
 */
export function lawWorth(obs: GameState, me: string, proposal: LawProposal): number {
  const setting = proposal.kind === 'enact' ? proposal.setting : obs.politics?.laws[proposal.law]?.setting;
  if (setting === undefined) return 0;
  const ban = proposal.law === 'sabotageBan';
  const cost = ban ? banCost(obs, me, setting) : (lawImpact(obs, { kind: 'enact', law: proposal.law, setting })[me]?.cost ?? 0);
  const gain = ban ? Math.round(sufferedAMonth(obs, me) * (1 - 1 / setting)) : 0;
  const worth = gain - cost;
  return (proposal.kind === 'enact' ? worth : -worth) || 0; // `|| 0`: never -0, so a worth of nothing compares as 0
}

/**
 * What a ban at `setting` adds a month to what `me` expects to pay for its own orders: its past orders a month played,
 * each at its kind's odds of being seen, times the standard fine and the caught move, each × (setting − 1).
 */
function banCost(obs: GameState, me: string, setting: number): number {
  const terms = orderTerms(obs);
  const own = (obs.politics?.sabotage ?? []).filter((o) => o.by === me && o.outcome !== 'pending');
  const caughtAMonth = own.reduce((n, o) => n + terms[o.target.kind].detect, 0) / Math.max(1, obs.month - 1);
  const extra = setting - 1;
  const fines = caughtAMonth * POLITICS.sheriff.fine.standard * extra;
  return Math.round(fines + caughtAMonth * reputationCost(obs, me, POLITICS.reputation.moves.caught * extra));
}

/** The damage of the power cuts done to `me` so far, a month played (planning has played month − 1), at today's output and prices. */
function sufferedAMonth(obs: GameState, me: string): number {
  const cuts = (obs.politics?.sabotage ?? []).filter((o) => o.target.kind === 'powerCut' && o.victim === me && o.worked === true);
  const damage = cuts.reduce((sum, o) => sum + (o.target.kind === 'powerCut' ? plotWorth(obs, o.target.tile) : 0), 0);
  return damage / Math.max(1, obs.month - 1);
}

// Slice 5: the budget and the overrule (spec §3.2, S5-C9). In credits, from public facts; RC values Projects, Welfare and
// the tax, and the after-RC targets are 0.

/** What one point of the colony's mood target is worth to `me` a month: more to the sitting Governor, whose re-election it sways. */
function moodPointWorth(obs: GameState, me: string): number {
  const { moodPoint, governorMood } = POLITICS.ai.budget;
  return moodPoint * (obs.politics?.governor === me ? governorMood : 1);
}

/**
 * What `amount` credits on `line` at this upkeep are worth to `me`, against the line paying 0; never falls as `amount`
 * rises. Welfare: the credits, if `me` is the recipient now, and the mood they buy (S5-RULE-5) at `me`'s mood point.
 * Projects: for each commissioned building short of credits, in the order the fund pays them, the share of it the
 * credits pay, times its prestige's mood (within the prestige cap) for the months left, at `me`'s mood point. 0 with
 * none, or when every one waits only for goods. A building's perk is not counted yet, nor is the fund's own wealth.
 * Security is after RC: 0.
 */
export function lineWorth(obs: GameState, me: string, line: BudgetLine, amount: number): number {
  const w = HAPPINESS.weights;
  const point = moodPointWorth(obs, me);
  if (line === 'welfare') {
    const mood = w.welfare * Math.min(Math.max(0, amount) / w.welfareUnit, w.welfareCap);
    return (welfareRecipient(obs) === me ? Math.max(0, amount) : 0) + mood * point;
  }
  if (line !== 'projects' || !obs.colony) return 0;
  const months = Math.max(0, endMonth(obs) - obs.month);
  let room = Math.max(0, w.prestigeCap - colonyPrestige(obs));
  let left = Math.max(0, amount);
  let worth = 0;
  for (const project of obs.colony.projects.filter((p) => p.stage === 'commissioned')) {
    // While the fund buys goods, its credits also buy the building's missing goods at the store, as far as it sells them
    // (colony.ts::fund): those count in what is still needed and in its cost (AM-15).
    const missing = Object.entries(stillNeeds(project).goods) as [Good, number][];
    const goods = COLONY.fundBuysGoods ? missing.reduce((n, [g, m]) => n + Math.min(m, storeForSale(obs, g)) * (storeQuotes(obs, g).sell ?? 0), 0) : 0;
    const need = Math.max(0, stillNeeds(project).credits) + goods;
    if (need === 0 || left <= 0) continue;
    const paid = Math.min(left, need);
    left -= paid;
    const row = PRESTIGE[project.id];
    const prestige = Math.min(row.prestige, room);
    room -= prestige;
    worth += (paid / (row.credits + goods)) * months * w.prestige * prestige * point;
  }
  return worth;
}

/** What `id` is expected to sell at this month's auctions, at the posted prices: what it holds beyond its need, as `obs` shows it. */
function expectedSales(obs: GameState, id: string): number {
  const p = obs.players.find((q) => q.id === id);
  if (!p) return 0;
  const need = auctionNeed(obs, id);
  return GOODS.reduce((sum, g) => sum + Math.max(0, p.stock[g] - need[g]) * obs.store.posted[g], 0);
}

/**
 * What passing an overrule of the target (by default the called overrule's, else the tax) is worth to `me`. The tax:
 * the overrule puts back the tax at the month's start, so `me` saves (tax now − tax at start) on its expected sales,
 * the seller paying (taxSale), less what the fund's change in tax income on everyone's expected sales would have
 * brought `me` through Projects and Welfare. Negative when the Governor cut the tax. Reads only `obs`: a hand also
 * calls it for other seats. The budget and no-confidence targets are after RC: 0.
 */
export function overruleWorth(obs: GameState, me: string, target: OverruleTarget = obs.politics?.overrule?.target ?? 'tax'): number {
  if (target !== 'tax' || !obs.politics) return 0;
  const delta = obs.treasury.salesTax - obs.politics.taxAtStart;
  if (delta === 0) return 0;
  const lost = delta * obs.players.reduce((sum, p) => sum + expectedSales(obs, p.id), 0);
  // Each line gets its share of the fund's change, within its cap, as budgetCredits pays it (review of #796, I1).
  const credits = budgetCredits(obs);
  const without = budgetCredits({ ...obs, treasury: { ...obs.treasury, money: obs.treasury.money - lost } });
  const through = (['projects', 'welfare'] as const).reduce((sum, line) => sum + lineWorth(obs, me, line, credits[line]) - lineWorth(obs, me, line, without[line]), 0);
  // `|| 0`: a cut with no sales and nothing through it is 0, not −0.
  return delta * expectedSales(obs, me) - through || 0;
}
