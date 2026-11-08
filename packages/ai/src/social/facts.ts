/** The fact guard: a message's declared facts and numbers checked against the public state when it is sent. */
import { allPrices, observe, scoreParts, type GameState, type Good, type PlayerId, type PlotIndex } from '@mule/engine';
import type { AiAction } from '../actions.js';
import type { PhaseFact } from '../playbook/index.js';

/** A game fact a message states, declared beside its text so it can be checked. */
export type Fact =
  | { price: Good; value: number }
  | { owner: PlotIndex; player: PlayerId | null }
  | { score: PlayerId; value: number }
  | { holding: Good; value: number }
  | { rule: string };

/** A message an AI's reply asks to send: to one player as a whisper, or to the table. Never recorded. */
export interface Message {
  to: PlayerId | 'table';
  purpose: string;
  text: string;
  facts: Fact[];
}

const ACTION_TYPES: Record<AiAction['type'], true> = {
  claim: true,
  buyMule: true,
  outfit: true,
  install: true,
  analyse: true,
  filter: true,
  pub: true,
  declare: true,
  walk: true,
  run: true,
  vote: true,
  setTax: true,
  done: true,
  drone: true,
  list: true,
  unlist: true,
  commission: true,
  donate: true,
  payStrike: true,
  repair: true,
  propose: true,
  voteLaw: true,
  setBudget: true,
  callOverrule: true,
  voteOverrule: true,
  offerDeal: true,
  withdrawDeal: true,
  answerDeal: true,
};
/** The action types a rule fact may name. */
export const RULE_NAMES: readonly string[] = Object.keys(ACTION_TYPES);

/** Words that open a statement of the speaker's own intention: a number after them in the clause is a plan, not a fact. */
const INTENTION = /\b(?:i'll|i will|i'd|i would|i can|i could|i'm going to|i am going to|let me|i offer|i promise|i plan to|i want to)\b/i;
const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const CLAUSE_END = /[.!?;]/;

function factHolds(state: GameState, obs: GameState, me: PlayerId, f: Fact, trades: readonly PhaseFact[]): boolean {
  if ('price' in f) return allPrices(obs)[f.price] === f.value || trades.some((t) => t.kind === 'trade' && t.good === f.price && t.price === f.value);
  if ('owner' in f) return obs.tiles[f.owner] !== undefined && obs.tiles[f.owner]!.owner === f.player;
  if ('score' in f) return obs.players.some((p) => p.id === f.score) && scoreParts(state, f.score).total === f.value;
  if ('holding' in f) return obs.players.find((p) => p.id === me)!.stock[f.holding] === f.value;
  return Object.hasOwn(ACTION_TYPES, f.rule);
}

const valuesOf = (facts: readonly Fact[]): number[] =>
  facts.flatMap((f) => ('value' in f ? [f.value] : 'owner' in f ? [f.owner] : []));

/** Whether the number at `index` in `text` names a month of this game, a plot of its map, or a count the speaker intends. */
function plainNumber(text: string, index: number, value: number, obs: GameState): boolean {
  const before = text.slice(0, index);
  const clause = before.slice(Math.max(...[...before.matchAll(new RegExp(CLAUSE_END, 'g'))].map((m) => m.index + 1), 0));
  if (/\bmonths? $/i.test(before)) return Number.isInteger(value) && value >= 1 && value <= obs.maxMonths;
  if (/\bplots? $/i.test(before)) return Number.isInteger(value) && value >= 0 && value < obs.tiles.length;
  return INTENTION.test(clause);
}

/**
 * RULE-B2: every declared fact is true against the public state (a price may also be a public trade's in `trades`),
 * and every number in the text is a declared fact's value, a month, a plot, or a count of the speaker's own
 * intentions. A message with no facts and no numbers passes. See spec B RULE-B2.
 */
export function factsHold(state: GameState, me: PlayerId, message: Pick<Message, 'text' | 'facts'>, trades: readonly PhaseFact[] = []): boolean {
  const obs = observe(state, me);
  if (!message.facts.every((f) => factHolds(state, obs, me, f, trades))) return false;
  const declared = valuesOf(message.facts);
  // A player's name may hold digits ("R2"): they are no number the text states.
  const text = obs.players.reduce((t, p) => (p.name === '' ? t : t.split(p.name).join('_'.repeat(p.name.length))), message.text);
  for (const m of text.matchAll(NUMBER)) {
    const value = Number(m[0].replace(/,/g, ''));
    if (!declared.includes(value) && !plainNumber(text, m.index, value, obs)) return false;
  }
  return true;
}
