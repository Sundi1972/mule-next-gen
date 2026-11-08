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
  isPublicOrder,
  lawImpact,
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
 * repeal is the negative of the law in force's worth (0 when it is not in force). Costs are slice 2a RULE-45's
 * (lawImpact). Only the sabotage ban gains: the power cuts `me` suffered a month (the public record, valued at today's
 * output and prices) times the share the ban deters, 1 − 1/setting, since it multiplies what a capture costs by the
 * setting (spec §10); its cost is the extra fines on `me`'s own revealed record (lawImpact).
 */
export function lawWorth(obs: GameState, me: string, proposal: LawProposal): number {
  const setting = proposal.kind === 'enact' ? proposal.setting : obs.politics?.laws[proposal.law]?.setting;
  if (setting === undefined) return 0;
  const cost = lawImpact(obs, { kind: 'enact', law: proposal.law, setting })[me]?.cost ?? 0;
  const gain = proposal.law === 'sabotageBan' ? Math.round(sufferedAMonth(obs, me) * (1 - 1 / setting)) : 0;
  const worth = gain - cost;
  return (proposal.kind === 'enact' ? worth : -worth) || 0; // `|| 0`: never -0, so a worth of nothing compares as 0
}

/** The damage of the power cuts done to `me` so far, a month played (planning has played month − 1), at today's output and prices. */
function sufferedAMonth(obs: GameState, me: string): number {
  const cuts = (obs.politics?.sabotage ?? []).filter((o) => o.target.kind === 'powerCut' && o.victim === me && o.worked === true);
  const damage = cuts.reduce((sum, o) => sum + (o.target.kind === 'powerCut' ? plotWorth(obs, o.target.tile) : 0), 0);
  return damage / Math.max(1, obs.month - 1);
}

// Slice 5: the budget.

/**
 * What `amount` credits on `line` this month are worth to `me`: its share of the benefit less its share of the cost.
 * A `budget` of null is the default, Projects 100.
 */
export function lineWorth(_obs: GameState, _me: string, _line: BudgetLine, _amount: number): number {
  return 0;
}

/**
 * What passing an overrule of the target (by default the called overrule's, else the tax) is worth to `me`: undoing this
 * month's tax or budget change, or no confidence in the Governor. Reads only `obs`: a hand also calls it for other seats.
 */
export function overruleWorth(obs: GameState, _me: string, _target: OverruleTarget = obs.politics?.overrule?.target ?? 'tax'): number {
  return 0;
}
