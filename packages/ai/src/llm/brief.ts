import {
  advancePhase,
  allPrices,
  BRAIN,
  corralTarget,
  emptyStock,
  energyUseOf,
  EVENTS,
  GOOD_CONFIG,
  GOODS,
  isFactory,
  monthNeeds,
  MS_PER_SECOND,
  MULE,
  mulePriceFor,
  needsOf,
  observe,
  PERCENT,
  scoreParts,
  SPECIES_PERK,
  type DevelopmentPlay,
  type GameState,
  type Good,
  type GoodPlay,
  type LandGrantPlay,
  type Outfit,
  type PhaseOutcome,
  type Playbook,
  type PlayerId,
  type ProductionLine,
  type RawGood,
  type Species,
  type Stock,
  type Strategy,
  UPKEEP,
} from '@mule/engine';
import { OPTION_IDS, toOptions, type TableTalk } from '../decider.js';
import type { Persona } from '../personas.js';
import { GOOD_NAME, landDecision, outfitName } from '../strategist.js';
import type { Mind } from '../value.js';
import { seatBounds } from './manual.js';
import { optionLine, tableTalkBlock } from './prompt.js';
import type { LandDraft } from '../playbook/index.js';
import type { Feedback } from './writer.js';
import { GRANTED } from './granted.js';


/** A land plan the brief offers: its letter, its label, and its full ranking as a LandGrantPlay ranking. */
export interface OfferedPlan {
  id: string;
  label: string;
  ranked: LandGrantPlay['ranked'];
}

/** One playbook path the brief lets the writer edit, and the JSON schema of the value it may set there. */
export interface EditOffer {
  path: string;
  to: object;
}

/** The seat's moment before a phase, as the user text, with what it offers the writer to pick from and to edit. */
export interface WriterBrief {
  text: string;
  /** The land plans a /landGrant/ranked edit picks by letter; none outside the land brief. */
  plans: OfferedPlan[];
  /** AI_LEVELS[level].corners: whether the seat may aim to corner a good. */
  corners: boolean;
  /** The draft's strategy the brief shows: what the writer's accepted strategy fields are set on. */
  strategy: Strategy;
  /** The paths it may edit, in the order the reply schema lists them. */
  offers: readonly EditOffer[];
  /** Whether it may also set the strategy: the land brief only, which plans the month. */
  strategyOffered: boolean;
}

/** The land brief: the month's plan, its strategy and land-grant edits. */
export type LandBrief = WriterBrief;

/** What the seat learned from its last phase: its PhaseOutcome, and what the rules and the writer refused of its reply. */
export interface LastPhase {
  outcome?: PhaseOutcome | null;
  feedback?: Feedback | null;
  /** Every seat's Worth when this seat's last plan was asked, and that plan's month; absent before its first. */
  worthBefore?: WorthAt | null;
}

/** Every seat's Worth at one moment, by seat, and the month of the plan asked then. */
export interface WorthAt {
  month: number;
  worth: Readonly<Record<PlayerId, number>>;
}

/** Every seat's Worth now, as the board shows it. */
export const worthNow = (state: GameState): Record<PlayerId, number> => Object.fromEntries(state.players.map((p) => [p.id, scoreParts(state, p.id).total]));

/**
 * The game as the goods auction opens: a copy of the production phase advanced into the auction, so the phase's events
 * (a raid, a fire), the store's posted prices and the auction's queue are the ones the auction will open on. The engine
 * is seeded, so the copy's events are the game's own. The auction's edits are asked in the production show, before
 * that, and the seat can do nothing between, so it learns no more than it would at the auction's start; drafting from
 * anything else showed a plan whose roles the auction's own draft did not keep (B fix 1, 6 Nov).
 */
export function atAuctionStart(state: GameState): GameState {
  const view = structuredClone(state);
  if (view.phase === 'production') advancePhase(view);
  return view;
}

/** What each species does, in the brief's words; a species with no perk says so. */
const SPECIES_TEXT: Record<Species, string> = {
  zipwing: `you walk ${SPECIES_PERK.zipwingSpeed} times as fast in development`,
  bramblet: `every farm of yours makes ${SPECIES_PERK.brambletFood} more Food`,
  // literal-ok: a share shown as a percent, not balance
  gearling: `you pay ${Math.round(SPECIES_PERK.gearlingPrice * 100)}% of the price for MULEs and outfits`,
  mollox: `every working mine of yours makes ${SPECIES_PERK.molloxMine} more, and you analyse ground in ${SPECIES_PERK.molloxAnalysis} of the time`,
  glimmer: 'no special gift',
  quibbit: 'you are first in line at the goods auction',
};
const speciesLine = (s: Species) => `Your species: ${s[0]!.toUpperCase()}${s.slice(1)} — ${SPECIES_TEXT[s]}.`;

const cr = (n: number) => n.toLocaleString('en-US');
const signed = (n: number) => (n >= 0 ? `+${cr(n)}` : `−${cr(-n)}`);

/** Every seat's Worth, best first, and the seat's own line by line: public on the board (the standings tool's). */
function standingsLines(state: GameState, me: PlayerId): string[] {
  const worth = worthNow(state);
  const order = [...state.players].sort((a, b) => worth[b.id]! - worth[a.id]! || a.id.localeCompare(b.id));
  const own = scoreParts(state, me);
  return [
    `Standings by Worth, best first (the highest Worth at the end wins): ${order.map((p) => `${p.name}${p.id === me ? ' (you)' : ''} ${cr(worth[p.id]!)}`).join(', ')}.`,
    `Your Worth ${cr(own.total)}: money ${cr(own.money)}, goods ${cr(own.goods)}, land ${cr(own.land)} (${own.plots} plots), MULEs ${cr(own.muleValue)}, office ${cr(own.office)}, donated ${cr(own.donated)}${own.cut ? `, less the cut ${cr(own.cut)}` : ''}.`,
  ];
}

/** Each seat's Worth change since the seat's last plan was asked; nothing before its first. */
function resultLines(state: GameState, me: PlayerId, before: WorthAt | null | undefined): string[] {
  if (!before) return [];
  const now = worthNow(state);
  const delta = (id: PlayerId) => now[id]! - (before.worth[id] ?? now[id]!);
  const rivals = state.players.filter((p) => p.id !== me).map((p) => `${p.name} ${signed(delta(p.id))}`);
  return [`Since your plan for month ${before.month}: your Worth ${cr(before.worth[me] ?? now[me]!)} → ${cr(now[me]!)} (${signed(delta(me))}); ${rivals.join(', ')}.`];
}

const AIM = 'Your aim: finish with the highest Worth. Make every edit raise your Worth against your rivals\'.';
const characterLine = (persona: Persona) => `Your character, for your table line only: ${persona.card}`;

/**
 * The playbook paths a land brief lets the writer edit, besides the strategy's fields: the ranking only. The land
 * grant's claims and press share, and its deny, plan B and pair, are not offered: play does not read them (WS9 ruling,
 * 6 Nov); claims and press share may return once WS9 wires them.
 */
export const LAND_PATHS = ['/landGrant/ranked'] as const;
export type LandPath = (typeof LAND_PATHS)[number];

/** What each land path's `to` is: a plan's letter. */
const LAND_TO: Record<LandPath, object> = {
  '/landGrant/ranked': { type: 'string', enum: [...OPTION_IDS] },
};
export const LAND_OFFERS: readonly EditOffer[] = LAND_PATHS.map((path) => ({ path, to: LAND_TO[path] }));

const OUTFITS: readonly Outfit[] = [...GOODS, 'greenBelt'];
const ROUTE_ACTS: readonly DevelopmentPlay['route'][number]['act'][] = ['buyMule', 'outfit', 'install', 'analyse', 'filter', 'pub'];
const IF_SOLD_OUT: readonly DevelopmentPlay['ifSoldOut'][] = ['pub', 'analyse', 'stop'];

/**
 * A route step's schema: every field required, plot and outfit null where the act takes none (structured outputs
 * take no optional field); the writer drops the nulls. A plot may be "granted", the plot the seat gains this month,
 * resolved at development's start (B fix 4 a, granted.ts): the land write is asked before the grant.
 */
const ROUTE_STEP = {
  type: 'object',
  properties: { act: { type: 'string', enum: [...ROUTE_ACTS] }, plot: { anyOf: [{ type: 'integer' }, { type: 'string', enum: [GRANTED] }, { type: 'null' }] }, outfit: { anyOf: [{ type: 'string', enum: [...OUTFITS] }, { type: 'null' }] } },
  required: ['act', 'plot', 'outfit'],
  additionalProperties: false,
};
export const DEVELOPMENT_OFFERS: readonly EditOffer[] = [
  { path: '/development/route', to: { type: 'array', items: ROUTE_STEP } },
  { path: '/development/timeBudgetMs', to: { type: 'integer' } },
  { path: '/development/ifSoldOut', to: { type: 'string', enum: [...IF_SOLD_OUT] } },
];
const GOOD_FIELDS: readonly { field: keyof GoodPlay; to: object }[] = [
  { field: 'role', to: { type: 'string', enum: ['buyer', 'seller', 'out'] } },
  { field: 'hold', to: { type: 'integer' } },
  { field: 'walkAway', to: { type: 'integer' } },
  { field: 'start', to: { type: 'integer' } },
  { field: 'concedeCrPerS', to: { type: 'number' } },
];

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

type PartWhy = ProductionLine['parts'][number]['why'];
/** What cut a plot's output, in the brief's words, by the reason production files (runProduction's parts). */
const LESS_WHY: Partial<Record<PartWhy, string>> = {
  energyOff: 'turned off for want of Energy',
  noEnergy: 'short of Energy',
  noWater: 'short of Water',
  pollution: 'pollution',
};
const partText = (p: ProductionLine['parts'][number]) => `${p.why === 'event' ? `the ${p.event ?? 'event'}` : (LESS_WHY[p.why] ?? p.why)} ${signed(p.delta)}`;

/**
 * One line per plot of the seat's own: what it made at the last production, from the line production filed for it
 * (the report's lines, which observe keeps), and each part that cut its output. A plot with no line made
 * nothing: no MULE, a green belt (it makes no goods), or works that did not run, short of their inputs. At most
 * BRAIN.brief.plotsPerPlayer plots, the rest counted.
 */
function plotOutputLines(obs: GameState, me: PlayerId): string[] {
  const report = obs.history.at(-1);
  if (!report) return ['No production has run yet.'];
  const filed = new Map((report.lines ?? []).map((l) => [l.tile, l]));
  const mine = obs.tiles.flatMap((t, i) => (t.owner === me && t.terrain !== 'store' ? [{ i, outfit: t.outfit }] : []));
  if (mine.length === 0) return [];
  const text = ({ i, outfit }: (typeof mine)[number]) => {
    if (!outfit) return `- plot ${i}: no MULE, made nothing`;
    const line = filed.get(i);
    const name = `- plot ${i} ${outfitName(outfit)}`;
    if (outfit === 'greenBelt') return `${name}: makes no goods`;
    if (!line) return isFactory(outfit) ? `${name}: made nothing: it did not run, short of its inputs` : `${name}: made nothing at the last production`;
    const less = line.parts.filter((p) => p.delta < 0);
    return `${name}: made ${line.made} ${GOOD_NAME[line.good]}${less.length > 0 ? ` (${less.map(partText).join(', ')})` : ''}`;
  };
  const shown = mine.slice(0, BRAIN.brief.plotsPerPlayer).map(text);
  if (mine.length > shown.length) shown.push(`- and ${mine.length - shown.length} more plots`);
  return [`What your plots made at the last production (month ${report.month}):`, ...shown];
}

/**
 * What the seat's own plots supplied of a good at the last production: for Energy, what its plants made less what they
 * paid for their own use. Each plant pays min(made, use) from its line, its use times the cold snap's factor when one
 * struck that production, as runProduction charges it (outlook.ts produce).
 */
function lastSupply(obs: GameState, me: PlayerId, made: Stock, good: 'food' | 'energy'): number {
  if (good !== 'energy') return made[good];
  const last = obs.history.at(-1);
  const cold = last?.events?.some((e) => e.key === 'coldSnap') ? EVENTS.colony.coldSnap.factor : 1;
  const paid = (last?.lines ?? [])
    .filter((l) => l.good === 'energy' && obs.tiles[l.tile]?.owner === me)
    .reduce((n, l) => n + Math.min(Math.max(0, l.made), energyUseOf(obs, obs.tiles[l.tile]!) * cold), 0);
  return Math.max(0, made.energy - paid);
}

/**
 * Food and Energy in units: what the seat holds and its own plots made at the last production (a plant's output net of
 * its own use: lastSupply), against what the engine says it burns (monthNeeds): its household's Food at upkeep, its plots' and works' Energy at production. What the plots make counts where it comes before the
 * burn: Energy always (plants run first in production); Food only before production (the land brief, at upkeep), since
 * after it (the auction brief) this month's Food is in what the seat holds, and upkeep eats next.
 */
function feedLine(obs: GameState, me: PlayerId, afterProduction: boolean): string {
  const p = obs.players.find((q) => q.id === me)!;
  const made = obs.history.at(-1)?.produced[me] ?? emptyStock();
  const need = monthNeeds(obs, me);
  const verdict = (held: number, makes: number, needs: number) => (held + makes >= needs ? 'covered' : `short by ${needs - held - makes}`);
  const food = lastSupply(obs, me, made, 'food');
  const energy = lastSupply(obs, me, made, 'energy');
  const foodText = afterProduction
    ? `Food — you hold ${p.stock.food}, the ${food} your plots made at the last production included, against ${need.food} your household eats a month: ${verdict(p.stock.food, 0, need.food)}`
    : `Food — you hold ${p.stock.food} and your plots made ${food} at the last production, against ${need.food} your household eats a month: ${verdict(p.stock.food, food, need.food)}`;
  return (
    `Food and Energy in units: ${foodText}; ` +
    `Energy — you hold ${p.stock.energy} and your plants made ${energy} beyond their own use, against ${need.energy} your plots and works use a production: ${verdict(p.stock.energy, energy, need.energy)}.`
  );
}

const pct = (share: number) => `${Math.round(share * PERCENT)}%`;

/** What upkeep leaves of `held` Water for the next production, as runUpkeep plays it: the drink, then spoilage rounded down. */
const waterAfterUpkeep = (held: number, drink: number) => Math.floor(Math.max(0, held - drink) * (1 - GOOD_CONFIG.water.spoilage));

/** The least Water the seat may end the auction with and still hold `need` when the next production checks it. */
function waterToKeep(need: number): number {
  let held = need;
  while (waterAfterUpkeep(held, need) < need) held++;
  return held;
}

/**
 * Water in units, against the check production makes before any plot runs (production.ts runProduction's `dry`): an
 * owner holding less than needsOf's water has its irrigated plots make UPKEEP.shortOutputShare. Asked before the next
 * production (the land brief), what the seat holds is what that check reads, and no goods auction comes between.
 * Asked after it (the auction brief), upkeep drinks and spoils first, so the seat must end the auction holding more.
 */
function waterLine(obs: GameState, me: PlayerId, afterProduction: boolean): string {
  const held = obs.players.find((q) => q.id === me)!.stock.water;
  const need = needsOf(obs, me).water;
  const farms = obs.tiles.filter((t) => t.owner === me && (UPKEEP.irrigated as readonly string[]).includes(t.outfit ?? '')).length;
  const kind = UPKEEP.irrigated.map((g: RawGood) => GOOD_NAME[g]).join(' or ');
  const plots = farms === 1 ? `your ${kind} plot` : `your ${farms} ${kind} plots`;
  const cut = `${plots} ${farms === 1 ? 'makes' : 'make'} ${pct(UPKEEP.shortOutputShare)} of ${farms === 1 ? 'its' : 'their'} output`;
  const head = `Water in units: you hold ${held}`;
  const drink = `${head}; your household and crew drink ${need} at upkeep, and`;
  if (afterProduction && obs.month >= obs.maxMonths) return `${drink} this is the last month: no production checks Water again.`;
  if (farms === 0) return `${drink} with no ${kind} plot of yours, going short of Water cuts nothing.`;
  if (!afterProduction) {
    const verdict = held >= need ? 'covered' : `short by ${need - held}, so ${cut} at that production, and no Water can be bought before it`;
    return `${head}, against the ${need} the next production checks you hold (what your household and crew drink a month, at your MULEs today): ${verdict}.`;
  }
  const keep = waterToKeep(need);
  const verdict = held >= keep ? 'covered' : `short by ${keep - held}, or ${cut} next month`;
  return (
    `${head}. To keep ${plots} whole next month, end this auction holding ${keep}: upkeep drinks ${need}, ` +
    `${pct(GOOD_CONFIG.water.spoilage)} of the rest spoils, rounded down, and the next production checks you still hold ${need}: ${verdict}.`
  );
}

/**
 * Where MULEs come from, as upkeep builds them (upkeep.ts): the corral now and this month's price to the seat; the
 * store's Smithore, and what the next upkeep builds from it, filling the corral back to corralTarget at
 * MULE.smithorePerMule each, whether the corral sells out or sells none.
 */
function muleLine(obs: GameState, me: PlayerId): string {
  const { mules } = obs.store;
  const smithore = obs.store.stock.smithore;
  const target = corralTarget(obs.players.length);
  const buildable = Math.floor(smithore / MULE.smithorePerMule);
  return (
    `MULEs: ${mules} in the corral, at ${mulePriceFor(obs, me)} cr each to you this month. ` +
    `The store holds ${smithore} Smithore; at the next upkeep it builds MULEs to fill the corral back to ${target}, ${MULE.smithorePerMule} Smithore each: ` +
    `on its Smithore today, ${Math.min(target, buildable)} if the corral sells out, ${Math.max(0, Math.min(target - mules, buildable))} if it sells none (the auction and a ship that takes Smithore can change that).`
  );
}

/** What the seat's plots made, and its Food, Energy and Water in units: the land and auction briefs'. */
const madeLines = (obs: GameState, me: PlayerId, afterProduction: boolean) => [...plotOutputLines(obs, me), feedLine(obs, me, afterProduction), waterLine(obs, me, afterProduction), ''];

/**
 * The land plans' "Feeds me" reason, for a level without a look-ahead, counts plots, not units (strategist.ts
 * landDecision: a Food plot and an Energy plot owned). The brief says what it counted, so it never claims a coverage the
 * units line contradicts (B fix 3). A level that looks ahead counts units, so its words stand.
 */
const FEEDS_ME: readonly [string, string][] = [
  ['my Food and Energy are covered', 'I own a Food plot and an Energy plot'],
  ['I still buy my Food and Energy', 'I lack a Food plot or an Energy plot'],
];
const plotsCounted = (mind: Mind, line: string) =>
  mind.level.lookAhead ? line : FEEDS_ME.reduce((l, [said, counted]) => l.replace(said, counted), line);

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

/** The strategy's fields that play reads: no monopolyTarget or cashFloor (WS9 ruling, 6 Nov). */
function strategyLine(s: Strategy): string {
  return `Your strategy: ${s.kind}, moneyMaker ${goodText(s.moneyMaker)}. "${s.reason}"`;
}

/** The draft land grant as play reads it: its ranking only (WS9 ruling, 6 Nov). */
function draftLines(g: LandGrantPlay): string[] {
  return [`Ranked: ${capped(g.ranked, BRAIN.brief.draftEntries, plotText)}`];
}

function changeLines(): string[] {
  return [
    '- strategy: kind, moneyMaker, reason; leave it out to keep your strategy.',
    '- /landGrant/ranked: the letter of a land plan; its ranking replaces the draft\'s.',
    `Every edit says why, as does the strategy, in at most ${BRAIN.writeReasonChars} characters.`,
  ];
}

/**
 * The land brief for one seat, from its observation only: no other seat's goods and no ground it has not analysed.
 * Deterministic for a given state, draft and talk, so the prompt can be cached up to it.
 */
export function landBrief(
  state: GameState,
  mind: Mind,
  persona: Persona,
  draft: LandDraft,
  talk: readonly TableTalk[],
  last: LastPhase = {},
  /** The month's draft development: shown and offered too, so one write a month edits both (PM ruling, 5 Nov, option C). */
  development: DevelopmentPlay | null = null,
): LandBrief {
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
    speciesLine(me.species),
    `You have ${me.money} credits. Your goods: ${goods.join(', ') || 'none'}.`,
    '',
    ...standingsLines(state, mind.me),
    ...resultLines(state, mind.me, last.worthBefore),
    '',
    'Who owns the land:',
    ...ownership(obs, mind.me),
    '',
    ...madeLines(obs, mind.me, false),
    priceLine(obs, state.history),
    `Store stock: ${GOODS.map((g) => `${GOOD_NAME[g]} ${obs.store.stock[g]}`).join(', ')}.`,
    muleLine(obs, mind.me),
    shipLine(obs),
    '',
    strategyLine(draft.strategy),
    '',
    ...outcomeLines(last.outcome, mind.me, names),
    ...refusalLines(last.feedback),
    'Land plans for this month, best first:',
    ...options.map((o, i) => `${plotsCounted(mind, optionLine(o))}: ${capped(plans[i]!.ranked, BRAIN.brief.plotsPerPlan, plotText)}`),
    '',
    'Your draft land grant:',
    ...draftLines(draft.landGrant),
    '',
    ...(development ? ['Your draft development:', ...developmentLines(development), ''] : []),
    'What you may change:',
    ...changeLines(),
    ...(development ? DEV_CHANGES : []),
    '',
    AIM,
    characterLine(persona),
    '',
    tableTalkBlock(talk.slice(-BRAIN.talkLines)),
    '',
    'Write your strategy and your edits, and reply with the JSON.',
  ].join('\n');
  return { text, plans, corners, strategy: draft.strategy, offers: development ? [...LAND_OFFERS, ...DEVELOPMENT_OFFERS] : LAND_OFFERS, strategyOffered: true };
}

/** What a brief that offers the development paths says of them. */
const DEV_CHANGES = [
  `- /development/route: the whole route, in order; each step {act, plot, outfit}, null where the act takes none; plot may be "${GRANTED}": this month's grant plot, else a plot won at this month's land auction.`,
  '- /development/timeBudgetMs: the time to spend, in ms.',
  '- /development/ifSoldOut: pub, analyse or stop.',
];

/** The phase the brief edits: the slack before it is when it is asked (RULE-A2 rows 3-4). */
export type EditPhase = 'development' | 'auction';

const ACT_TEXT = (s: DevelopmentPlay['route'][number]): string => {
  switch (s.act) {
    case 'buyMule':
      return 'buy a MULE';
    case 'outfit':
      return s.outfit ? `outfit it for ${s.outfit === 'greenBelt' ? 'a green belt' : GOOD_NAME[s.outfit]}` : 'outfit it';
    case 'install':
      return `install it on plot ${s.plot}`;
    case 'analyse':
      return `analyse plot ${s.plot}`;
    case 'filter':
      return `filter plot ${s.plot}`;
    case 'pub':
      return 'the pub';
  }
};

function developmentLines(d: DevelopmentPlay | undefined): string[] {
  if (!d) return ['No development play is drafted.'];
  return [
    `Route: ${d.route.length === 0 ? 'none' : d.route.map(ACT_TEXT).join(', ')}.`,
    `Time budget: ${Math.round(d.timeBudgetMs / MS_PER_SECOND)} s of your development time.`,
    `If the corral is sold out: ${d.ifSoldOut}.`,
  ];
}

const goodLine = (g: Good, p: GoodPlay) =>
  `${GOOD_NAME[g]}: ${p.role}, hold ${p.hold}, start ${p.start}, walk away at ${p.walkAway}, concede ${p.concedeCrPerS} cr/s, vs a rival on your side ${p.vsRival}.`;

/** The draft's goods in the colony's order, each with its play. */
const draftGoods = (a: Playbook['auction']) => GOODS.flatMap((g) => (a?.[g] ? [[g, a[g]!] as const] : []));

function auctionLines(a: Playbook['auction']): string[] {
  const goods = draftGoods(a);
  if (goods.length === 0) return ['No auction play is drafted.'];
  const shown = goods.slice(0, BRAIN.brief.auctionGoods).map(([g, p]) => goodLine(g, p));
  return goods.length > shown.length ? [...shown, `and ${goods.length - shown.length} more goods, played as drafted`] : shown;
}

/**
 * The brief for the development or the auction, asked for in the slack before it: the seat's public moment, its
 * strategy and last outcome, and the draft part for that phase with the paths it may edit. No strategy: that is the
 * land brief's, which plans the month. From the seat's observation only, deterministic for a given state and draft.
 */
export function phaseBrief(state: GameState, mind: Mind, persona: Persona, draft: Playbook, phase: EditPhase, talk: readonly TableTalk[], last: LastPhase = {}): WriterBrief {
  const obs = observe(state, mind.me);
  const me = obs.players.find((p) => p.id === mind.me)!;
  const corners = mind.level.corners;
  const goods = GOODS.filter((g) => me.stock[g] > 0).map((g) => `${GOOD_NAME[g]} ${me.stock[g]}`);
  const names = new Map(obs.players.map((p) => [p.id, p.name]));
  const offered = draftGoods(draft.auction).slice(0, BRAIN.brief.auctionGoods);
  const offers =
    phase === 'development' ? DEVELOPMENT_OFFERS : offered.flatMap(([g]) => GOOD_FIELDS.map(({ field, to }) => ({ path: `/auction/${g}/${field}`, to })));
  const text = [
    `You are ${me.name}. Month ${obs.month} of ${obs.maxMonths}, before the ${phase}.`,
    `Your level: ${mind.levelId}. ${seatBounds(mind.level)}`,
    speciesLine(me.species),
    `You have ${me.money} credits. Your goods: ${goods.join(', ') || 'none'}.`,
    '',
    ...standingsLines(state, mind.me),
    ...resultLines(state, mind.me, last.worthBefore),
    '',
    'Who owns the land:',
    ...ownership(obs, mind.me),
    '',
    ...(phase === 'auction' ? madeLines(obs, mind.me, true) : []),
    priceLine(obs, state.history),
    `Store stock: ${GOODS.map((g) => `${GOOD_NAME[g]} ${obs.store.stock[g]}`).join(', ')}.`,
    shipLine(obs),
    '',
    strategyLine(draft.strategy),
    '',
    ...outcomeLines(last.outcome, mind.me, names),
    ...refusalLines(last.feedback),
    `Your draft ${phase}:`,
    ...(phase === 'development' ? developmentLines(draft.development) : auctionLines(draft.auction)),
    '',
    'What you may change:',
    ...(phase === 'development'
      ? DEV_CHANGES
      : ['- /auction/<good>/role, hold, walkAway, start, concedeCrPerS, for each good above.']),
    `Every edit says why, in at most ${BRAIN.writeReasonChars} characters.`,
    '',
    AIM,
    characterLine(persona),
    '',
    tableTalkBlock(talk.slice(-BRAIN.talkLines)),
    '',
    'Write your edits, and reply with the JSON.',
  ].join('\n');
  return { text, plans: [], corners, strategy: draft.strategy, offers, strategyOffered: false };
}
