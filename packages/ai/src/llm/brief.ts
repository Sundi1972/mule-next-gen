import { allPrices, BRAIN, GAME, GOODS, observe, type GameState, type LandGrantPlay, type PhaseOutcome, type Strategy } from '@mule/engine';
import { toOptions, type TableTalk } from '../decider.js';
import type { Persona } from '../personas.js';
import { GOOD_NAME, landDecision, outfitName } from '../strategist.js';
import type { Mind } from '../value.js';
import { seatBounds } from './manual.js';
import { optionLine, tableTalkBlock } from './prompt.js';
import type { LandDraft } from '../playbook/index.js';
import type { Feedback } from './writer.js';


/** A land plan the brief offers: its letter, its label, and its full ranking as a LandGrantPlay ranking. */
export interface OfferedPlan {
  id: string;
  label: string;
  ranked: LandGrantPlay['ranked'];
}

/** The seat's moment before the land grant, as the user text, with what it offers the writer to pick from. */
export interface LandBrief {
  text: string;
  plans: OfferedPlan[];
  /** AI_LEVELS[level].corners: whether the seat may aim to corner a good. */
  corners: boolean;
  /** The draft's strategy the brief shows: what the writer's accepted strategy fields are set on. */
  strategy: Strategy;
}

/** What the seat learned from its last phase: its PhaseOutcome, and what the rules and the writer refused of its reply. */
export interface LastPhase {
  outcome?: PhaseOutcome | null;
  feedback?: Feedback | null;
}

/** The playbook paths a land brief lets the writer edit, besides the strategy's fields. */
export const LAND_PATHS = ['/landGrant/ranked', '/landGrant/claims', '/landGrant/pressShare'] as const;
export type LandPath = (typeof LAND_PATHS)[number];

const plotText = (r: { plot: number; value: number }) => `plot ${r.plot} (${r.value} cr)`;
const goodText = (g: Strategy['moneyMaker']) => (g === null ? 'none' : GOOD_NAME[g]);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** At most `cap` items as text, the rest counted. */
function capped<T>(items: readonly T[], cap: number, text: (t: T) => string): string {
  if (items.length === 0) return 'none';
  const shown = items.slice(0, cap).map(text).join(', ');
  return items.length > cap ? `${shown} and ${items.length - cap} more` : shown;
}

/** Each player's plots and what is on them: public on the board. */
function ownership(obs: GameState, me: string): string[] {
  const lines = obs.players.map((p) => {
    const plots = obs.tiles.flatMap((t, i) => (t.owner === p.id ? [{ i, outfit: t.outfit }] : []));
    const who = p.id === me ? `${p.name} (you)` : p.name;
    if (plots.length === 0) return `${who}: no plots`;
    const named = capped(plots, BRAIN.brief.plotsPerPlayer, (t) => `plot ${t.i} ${t.outfit ? outfitName(t.outfit) : 'idle'}`);
    return `${who}: ${plural(plots.length, 'plot')} — ${named}`;
  });
  const free = obs.tiles.filter((t) => t.owner === null && t.terrain !== 'store').length;
  return [...lines, `Free plots: ${free}.`];
}

/**
 * This month's prices, each with the months before it, newest first: public on the store's board. The months come from
 * the game's own history, since an observation keeps only the two its pricing reads; only their prices are read.
 */
function priceLine(obs: GameState, history: GameState['history']): string {
  const now = allPrices(obs);
  const before = history.slice(-BRAIN.brief.trendMonths).reverse();
  const cell = (g: (typeof GOODS)[number]) => {
    const was = before.map((h) => h.prices[g]);
    return `${GOOD_NAME[g]} ${now[g]}${was.length > 0 ? ` (was ${was.join(', ')})` : ''}`;
  };
  return `Colony prices: ${GOODS.map(cell).join(', ')}.`;
}

/** The export ship's wishlist once it is announced (observe leaves an unannounced ship empty). */
function shipLine(obs: GameState): string {
  const { ship } = obs;
  if (ship.goods.length === 0) return 'No export ship is announced.';
  return `The export ship calls in month ${ship.arrives} and wants: ${ship.goods.map((g) => `${GOOD_NAME[g]} ${ship.hold[g] ?? 0}`).join(', ')}.`;
}

const valueText = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/**
 * What happened in the seat's last phase: each planned item against what it got, then each rival's public claims and
 * trades. Only the seat's own outcome: one stamped for another seat shows nothing.
 */
function outcomeLines(outcome: PhaseOutcome | null | undefined, me: string, names: ReadonlyMap<string, string>): string[] {
  if (!outcome || outcome.seat !== me) return [];
  const items = outcome.items.map((i) => `${i.path}: planned ${valueText(i.expected)}, got ${valueText(i.actual)}${i.note ? ` (${i.note})` : ''}`);
  const shown = items.slice(0, BRAIN.brief.outcomeItems);
  if (items.length > shown.length) shown.push(`and ${items.length - shown.length} more`);
  const rivals = Object.entries(outcome.rivals).flatMap(([id, r]) => {
    const parts: string[] = [];
    if (r.claimed?.length) parts.push(`claimed ${r.claimed.map((p) => `plot ${p}`).join(', ')}`);
    if (r.traded?.length) parts.push(capped(r.traded, BRAIN.brief.rivalTrades, (t) => `${t.side === 'buyer' ? 'bought' : 'sold'} ${t.qty} ${GOOD_NAME[t.good]} at ${t.price}`));
    if (r.declaredButIdle?.length) parts.push(`declared for ${r.declaredButIdle.map((g) => GOOD_NAME[g]).join(', ')} and traded none`);
    return parts.length > 0 ? [`${names.get(id) ?? id} ${parts.join('; ')}.`] : [];
  });
  return [`What happened in your last phase (month ${outcome.month}, ${outcome.phase}):`, ...shown, ...rivals, ''];
}

/**
 * What the rules clamped or refused of the seat's last reply (a clamped edit played, at the bound), and what the writer
 * refused before the rules saw it; each kind only when there is one.
 */
function refusalLines(feedback: Feedback | null | undefined): string[] {
  const parts: string[] = [];
  if (feedback?.rejected.length) parts.push(`the rules clamped or refused ${capped(feedback.rejected, BRAIN.brief.refusals, (r) => `${r.path} (${r.why})`)}`);
  if (feedback?.refused.length) parts.push(`your reply was refused at ${capped(feedback.refused, BRAIN.brief.refusals, (r) => `${r.path ?? 'the reply'} (${r.cause})`)}`);
  return parts.length > 0 ? [`Last time: ${parts.join('; ')}.`, ''] : [];
}

function strategyLine(s: Strategy, corners: boolean): string {
  const target = corners ? `, monopolyTarget ${goodText(s.monopolyTarget)}` : '';
  return `Your strategy: ${s.kind}, moneyMaker ${goodText(s.moneyMaker)}${target}, cashFloor ${s.cashFloor}. "${s.reason}"`;
}

function draftLines(g: LandGrantPlay): string[] {
  const cap = BRAIN.brief.draftEntries;
  return [
    `Ranked: ${capped(g.ranked, cap, plotText)}`,
    `Press share: from ${g.pressShare.start} down to ${g.pressShare.end} of the best free plot's value as the grant goes on.`,
    `Claims: ${g.claims}.`,
    `Deny: ${capped(g.deny, cap, (d) => `plot ${d.plot} from ${d.rival} up to ${d.maxCost} cr`)}.`,
    `Plan B: ${capped(g.planB, cap, (p) => `plot ${p}`)}.`,
    ...(g.pair ? [`Pair: plot ${g.pair[0]} with plot ${g.pair[1]}.`] : []),
  ];
}

function changeLines(corners: boolean): string[] {
  const fields = ['kind', 'moneyMaker', ...(corners ? ['monopolyTarget'] : []), 'cashFloor', 'reason'];
  return [
    `- strategy: ${fields.join(', ')}; leave it out to keep your strategy.`,
    '- /landGrant/ranked: the letter of a land plan; its ranking replaces the draft\'s.',
    `- /landGrant/claims: how many plots to claim, 0 to ${GAME.claimsPerGrant}.`,
    '- /landGrant/pressShare: {start, end}, with 0 ≤ end ≤ start ≤ 1.',
    `Every edit says why, as does the strategy, in at most ${BRAIN.writeReasonChars} characters.`,
  ];
}

/**
 * The land brief for one seat, from its observation only: no other seat's goods and no ground it has not analysed.
 * Deterministic for a given state, draft and talk, so the prompt can be cached up to it.
 */
export function landBrief(state: GameState, mind: Mind, persona: Persona, draft: LandDraft, talk: readonly TableTalk[], last: LastPhase = {}): LandBrief {
  const obs = observe(state, mind.me);
  const me = obs.players.find((p) => p.id === mind.me)!;
  const corners = mind.level.corners;
  const shortlist = landDecision(obs, mind);
  const options = toOptions(shortlist).slice(0, BRAIN.brief.plans);
  const plans: OfferedPlan[] = options.map((o, i) => ({
    id: o.id,
    label: o.label,
    ranked: shortlist.options[i]!.action.ranking.map((s) => ({ plot: s.index, value: Math.round(s.value) })),
  }));
  const goods = GOODS.filter((g) => me.stock[g] > 0).map((g) => `${GOOD_NAME[g]} ${me.stock[g]}`);
  const names = new Map(obs.players.map((p) => [p.id, p.name]));
  const text = [
    `You are ${me.name}. Month ${obs.month} of ${obs.maxMonths}, phase ${obs.phase}.`,
    `Your level: ${mind.levelId}. ${seatBounds(mind.level)}`,
    `You have ${me.money} credits. Your goods: ${goods.join(', ') || 'none'}.`,
    '',
    'Who owns the land:',
    ...ownership(obs, mind.me),
    '',
    priceLine(obs, state.history),
    `Store stock: ${GOODS.map((g) => `${GOOD_NAME[g]} ${obs.store.stock[g]}`).join(', ')}.`,
    shipLine(obs),
    '',
    strategyLine(draft.strategy, corners),
    '',
    ...outcomeLines(last.outcome, mind.me, names),
    ...refusalLines(last.feedback),
    'Land plans for this month, best first:',
    ...options.map((o, i) => `${optionLine(o)}: ${capped(plans[i]!.ranked, BRAIN.brief.plotsPerPlan, plotText)}`),
    '',
    'Your draft land grant:',
    ...draftLines(draft.landGrant),
    '',
    'What you may change:',
    ...changeLines(corners),
    '',
    `Your character: ${persona.card}`,
    '',
    tableTalkBlock(talk.slice(-BRAIN.talkLines)),
    '',
    'Write your strategy and your edits, and reply with the JSON.',
  ].join('\n');
  return { text, plans, corners, strategy: draft.strategy };
}
