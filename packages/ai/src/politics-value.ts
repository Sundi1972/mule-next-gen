/**
 * What politics is worth to a seat, in credits: the values WS7's hands (deal cards, sabotage and the Sheriff, the
 * Governor's budget and overrule) decide with. The signatures were agreed with WS7 on 7 Nov; the hands build against
 * them now and each body follows its slice's design.
 *
 * Every function is pure and reads only `obs`, the seat's own `observe(state, me)`: never raw state, never the seed,
 * never a rival's secret order (HC-4). Nothing draws. Where the engine itself draws (capture), the engine exports the
 * odds and these values read it, so its formula exists once.
 *
 * STUBS until each slice's design: every value is 0 and trust is a coin's even chance. lawWorth is real today.
 */
import { lawImpact, type GameState, type LawProposal } from '@mule/engine';
import type { BudgetLine, DealCard, SabotageOrder } from './politics-types.js';

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

// Slice 4: sabotage and the Sheriff.

/** What `order` gains `me` if it succeeds: its direct gain and the target's loss as it moves the market or the ranking. */
export function sabotageGain(_obs: GameState, _me: string, _order: SabotageOrder): number {
  return 0;
}

/** What being caught at `order` costs `me`: the fine, the reputation, and the pacts a capture breaks. */
export function captureCost(_obs: GameState, _me: string, _order: SabotageOrder): number {
  return 0;
}

/** What guarding `plot` this month saves `me`: the sabotage loss there it prevents. */
export function guardValue(_obs: GameState, _me: string, _plot: number): number {
  return 0;
}

/** What investigating `suspect` is worth to `me` as Sheriff. */
export function investigateValue(_obs: GameState, _me: string, _suspect: string): number {
  return 0;
}

// Every slice: laws.

/**
 * What `proposal` is worth to `me` a month: an enact is minus what the law at its setting costs `me`; a repeal is what
 * the law in force costs `me`, saved (0 when it is not in force). Slice 2a RULE-45's costs; the sabotage ban joins as
 * a law once slice 4 adds it.
 */
export function lawWorth(obs: GameState, me: string, proposal: LawProposal): number {
  const setting = proposal.kind === 'enact' ? proposal.setting : obs.politics?.laws[proposal.law]?.setting;
  if (setting === undefined) return 0;
  const cost = lawImpact(obs, { kind: 'enact', law: proposal.law, setting })[me]?.cost ?? 0;
  return proposal.kind === 'enact' ? -cost : cost;
}

// Slice 5: the budget.

/** What `amount` per cent of the fund on `line` this month is worth to `me`: its share of the benefit less its share of the cost. */
export function lineWorth(_obs: GameState, _me: string, _line: BudgetLine, _amount: number): number {
  return 0;
}

/** What overruling this month's budget back to the one planning opened with (Politics.budgetAtStart) is worth to `me`. */
export function overruleWorth(_obs: GameState, _me: string): number {
  return 0;
}
