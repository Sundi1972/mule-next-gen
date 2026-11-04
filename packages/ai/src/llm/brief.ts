import { allPrices, BRAIN, GAME, GOODS, observe, type GameState, type LandGrantPlay, type Strategy } from '@mule/engine';
import { toOptions, type TableTalk } from '../decider.js';
import type { Persona } from '../personas.js';
import { GOOD_NAME, landDecision, outfitName } from '../strategist.js';
import type { Mind } from '../value.js';
import { optionLine, tableTalkBlock } from './prompt.js';

/** What the engine drafted for the seat this month, as far as the land brief shows it. */
export interface LandDraft {
  strategy: Strategy;
  landGrant: LandGrantPlay;
}

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
export function landBrief(state: GameState, mind: Mind, persona: Persona, draft: LandDraft, talk: readonly TableTalk[]): LandBrief {
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
  const prices = allPrices(obs);
  const goods = GOODS.filter((g) => me.stock[g] > 0).map((g) => `${GOOD_NAME[g]} ${me.stock[g]}`);
  const bound = corners
    ? 'Your level may aim to corner a good.'
    : 'Your level never aims for a monopoly: never choose monopolist.';

  const text = [
    `You are ${me.name}. Month ${obs.month} of ${obs.maxMonths}, phase ${obs.phase}.`,
    `Your level: ${mind.levelId}. ${bound}`,
    `You have ${me.money} credits. Your goods: ${goods.join(', ') || 'none'}.`,
    '',
    'Who owns the land:',
    ...ownership(obs, mind.me),
    '',
    `Colony prices: ${GOODS.map((g) => `${GOOD_NAME[g]} ${prices[g]}`).join(', ')}.`,
    '',
    strategyLine(draft.strategy, corners),
    '',
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
