/**
 * The manual: every phase, how Worth is counted, every move and when it is smart, rendered from the move descriptors
 * and config so a rule change cannot leave it stale. Byte-stable for a given config, so it can sit in a cached system
 * block; anything that differs by seat goes in `seatBounds`.
 */
import {
  ADJACENCY,
  DEV_WALK,
  DEVELOPMENT,
  EXPORT_DEMAND,
  EXPORT_SHIP,
  GAME,
  GOOD_CONFIG,
  GOODS,
  LOTS,
  MULE,
  PERCENT,
  POLITICS,
  POLLUTION,
  PRICE,
  RECIPES,
  STRATEGIST,
  UPKEEP,
  WALK,
  type AiLevelConfig,
  type DevelopmentPlay,
  type GoodPlay,
  type LandGrantPlay,
  type Phase,
  type PlanningPlay,
  type ProcessedGood,
  type ScoreParts,
  type Strategy,
} from '@mule/engine';
import type { AiAction } from '../actions.js';
import { GOOD_NAME } from '../strategist.js';
import { MOVES, type MoveDescriptor, type MoveTable } from './moves-stub.js';

type FieldsOf<Name extends string, T> = `${Name}.${Extract<keyof T, string>}`;

/** A playbook field an advice line points at, as `Interface.key`. */
export type PlaybookField =
  | FieldsOf<'Strategy', Strategy>
  | FieldsOf<'PlanningPlay', PlanningPlay>
  | FieldsOf<'LandGrantPlay', LandGrantPlay>
  | FieldsOf<'DevelopmentPlay', DevelopmentPlay>
  | FieldsOf<'GoodPlay', GoodPlay>;

/**
 * The keys of T the writer is offered, at run time: every key is listed, true when a brief offers it; the mapped type
 * makes the compiler reject a missing or unknown key, so a new playbook field must be ruled on here.
 */
const offeredOf = <T>(name: string, keys: { readonly [K in keyof Required<T>]: boolean }) =>
  Object.entries(keys).flatMap(([k, offered]) => (offered ? [`${name}.${k}`] : []));

/**
 * The playbook fields an advice line may name: the ones a brief offers the writer. The rest are not offered: play does
 * not read monopolyTarget, cashFloor, landTarget, stances, the land grant's claims, press share, deny, plan B and pair,
 * or the market (WS9 ruling, 6 Nov); planning and a good's bluff, vsRival and per are not offered either.
 */
const OFFERED_FIELDS: ReadonlySet<string> = new Set([
  ...offeredOf<Strategy>('Strategy', {
    kind: true,
    moneyMaker: true,
    monopolyTarget: false,
    cashFloor: false,
    landTarget: false,
    stances: false,
    reason: true,
  }),
  ...offeredOf<PlanningPlay>('PlanningPlay', { drone: false, list: false }),
  ...offeredOf<LandGrantPlay>('LandGrantPlay', { ranked: true, pressShare: false, deny: false, planB: false, claims: false, pair: false }),
  ...offeredOf<DevelopmentPlay>('DevelopmentPlay', { route: true, timeBudgetMs: true, ifSoldOut: true }),
  ...offeredOf<GoodPlay>('GoodPlay', {
    role: true,
    hold: true,
    walkAway: true,
    start: true,
    concedeCrPerS: true,
    bluff: false,
    vsRival: false,
    per: false,
    market: false,
  }),
]);

/** When a move is smart, tied to the move and to the playbook field that acts on it. */
export interface AdviceLine {
  move: AiAction['type'];
  field: PlaybookField;
  when: () => string;
}

const pct = (share: number) => `${Math.round(share * PERCENT)}%`;
const goodList = (goods: readonly string[]) => goods.map((g) => GOOD_NAME[g as keyof typeof GOOD_NAME]).join(', ');
const COLLAPSE_AIR = POLLUTION.bands.find((b) => b.name === 'collapse')!.from;
const monthsList = (months: readonly number[]) => months.join(', ');

const PHASE_NAME: Record<Phase, string> = {
  planning: 'planning',
  landGrant: 'the land grant',
  landAuction: 'the land auction',
  development: 'development',
  production: 'production',
  auction: 'the goods auction',
  upkeep: 'upkeep',
  gameOver: 'game over',
};

const recipe = (good: ProcessedGood) => {
  const { inputs, output } = RECIPES[good];
  const used = Object.entries(inputs).map(([g, n]) => `${n} ${GOOD_NAME[g as keyof typeof GOOD_NAME]}`);
  return `${GOOD_NAME[good]}: ${used.join(' + ')} make ${output}`;
};

/** Each phase in the order a month plays them, with its rules. */
const PHASES: Record<Exclude<Phase, 'gameOver'>, () => string> = {
  planning: () =>
    `Everyone reads the colony's stores, prices and plots. Players may send a geo drone over ${DEVELOPMENT.dronePlots} free or listed plots for ${DEVELOPMENT.droneFee} credits (their ground is known at once), and list up to ${LOTS.perPlayer} plots or MULEs for the land auction, ${LOTS.maxLotsPerMonth} lots a month from all sellers. In months ${monthsList(POLITICS.electionMonths)} planning opens with an election for ${POLITICS.offices.join(', ')}: announce, then a secret ballot if an office has two or more candidates, then the result. Planning ends when every player is Ready.`,
  landGrant: () =>
    `The light passes over the free plots one at a time in reading order, ${GAME.grantTickMs} ms each, ${GAME.grantSweeps} pass; the first player to press claims the lit plot, up to ${GAME.claimsPerGrant} claims each. It ends after the pass, when no free land is left, or once every player has used their claims or is Done.`,
  landAuction: () =>
    `The listed lots come up one at a time: an intro of ${LOTS.introMs} ms, then a walk of ${LOTS.walkMs} ms where every player but the seller stands as a buyer, unless short of the minimum or leading a MULE when a MULE is up, and walks up to bid. The highest bid at the bell wins; a change of leader in the last ${LOTS.lateMs} ms sets the clock back to it. An unsold lot is kept, or sold to the store for ${pct(LOTS.storePlotShare)} of the ${GAME.plotScore} a plot scores and ${pct(LOTS.storeMuleShare)} of the MULE price for a MULE, as the seller chose. Each month the colony puts one free plot up with a chance of ${pct(LOTS.colonyPlotChance)}. With nothing listed it is skipped.`,
  development: () =>
    `One clock of ${DEVELOPMENT.fullSeconds} s for every player. Each step from one map tile to the next takes ${DEV_WALK.tileSeconds} s; a hungry or sick colonist walks slower. You buy a MULE at the corral, outfit it, and install it on one of your plots; you may analyse ground, fit filters, or end at the pub for cash. ${muleSupply()}`,
  production: () =>
    `Every plot with a MULE makes its good, more on better ground, plus ${ADJACENCY.neighbour} when a neighbour of yours makes the same good, or ${ADJACENCY.cluster} in a cluster of ${ADJACENCY.clusterSize} or more. A raw plot burns Energy from your stock (${rawEnergy()}); an Energy plot pays its own from its output and is never turned off. An owner short of Energy has their other plots turned off, biggest use first, until the rest fit; a plot turned off makes ${pct(UPKEEP.offOutputShare)} of its output, rounded half up. ${waterCut()} A factory turns inputs from your stock into its good (${(Object.keys(RECIPES) as ProcessedGood[]).map(recipe).join('; ')}) and makes nothing without them. A factory turned off for want of Energy makes ${pct(UPKEEP.offOutputShare)} of its output from ${pct(UPKEEP.offOutputShare)} of each non-Energy input, rounded up, and takes no inputs when its share of output rounds to 0.`,
  auction: () =>
    `Goods come up one at a time (${goodList(WALK.order)}). Each has a status screen where players pick buyer, seller or pass, ${WALK.statusMs === null ? "with no clock: it waits for every player's Done or the host's Continue" : `for ${WALK.statusMs} ms`}, then a walk of ${WALK.goodMs} ms: buyers walk up, sellers down, and units trade while a buyer and a seller meet. The store buys and sells there too, and every sale pays the sales tax into the colony fund. In a month the export ship calls it buys there too, from any seller, up to its hold of each good on its wishlist: the off-world price for its first unit of a good and ${pct(EXPORT_SHIP.stepDown)} less for each one after, ${pct(POLLUTION.cleanExportBonus)} more when the air is clean; a sale to it pays the sales tax and any export tax.`,
  upkeep: () =>
    `Each player eats ${UPKEEP.baseFood} Food and drinks ${UPKEEP.baseWater} Water, plus 1 Food per ${UPKEEP.crewPerFood} crew and 1 Water per ${UPKEEP.crewPerWater}, from their own stock. Your goods spoil (${spoiling()}, rounded down), and anything above ${UPKEEP.depotCapacity} units of a good is lost. Every ${GAME.exportShipEvery} months, first in month ${GAME.exportShipEvery}, an export ship calls; its wishlist of ${EXPORT_SHIP.wishlist} goods, drawn from ${goodList(Object.keys(EXPORT_DEMAND))}, is public from the month before. It buys from players at that month's goods auction, then at upkeep takes the store's surplus of those goods until its hold is full: what the store holds above ${PRICE.targetCover} months of the colony's demand.`,
};

/**
 * The Water cut, how it stacks on the Energy cut, and when it is decided, as production.ts runProduction applies them:
 * `dry` before any plot runs, switchOff, then halve on what the parts add up to after it.
 */
function waterCut(): string {
  const irrigated = UPKEEP.irrigated.map((g) => GOOD_NAME[g]).join(' or ');
  return `A ${irrigated} plot also needs Water: when its owner holds less Water than their household and crew drink, it makes ${pct(UPKEEP.shortOutputShare)} of what it would, rounded down; one also turned off for want of Energy takes both cuts, the Water cut on what the Energy cut left. Who is short of Water is decided as production begins, before any plot runs, from the Water the last upkeep left, against what the household and crew drink with every MULE installed by then, that month's development included: a ${irrigated} plot installed that month is checked at once, and Water made at a production waters the next one.`;
}

/** How the store makes MULEs and prices them: upkeep.ts builds them, game.ts moves the factor, economy.ts mulePrice. */
function muleSupply(): string {
  return [
    `At upkeep the store builds MULEs from its own Smithore, ${MULE.smithorePerMule} Smithore each, until the corral holds ${corral()}; short of Smithore it builds fewer, so the corral can run dry.`,
    `A MULE costs ${MULE.labour} plus ${MULE.smithorePerMule} Smithore at the store's posted price, times a scarcity factor: up ${pct(MULE.scarcityUp)} after a development that sold the corral out, down ${pct(MULE.surplusDown)} after one that left ${pct(MULE.surplusShare)} or more of its MULEs unsold, never below ${pct(MULE.minFactor)} of that base.`,
  ].join(' ');
}

const corral = () => `${MULE.corralPerPlayer} for each player plus ${MULE.spareInCorral}`;

function rawEnergy(): string {
  return Object.entries(UPKEEP.energyUse)
    .map(([g, n]) => `${GOOD_NAME[g as keyof typeof GOOD_NAME]} ${n}`)
    .join(', ');
}

function spoiling(): string {
  return GOODS.filter((g) => GOOD_CONFIG[g].spoilage > 0)
    .map((g) => `${GOOD_NAME[g]} ${pct(GOOD_CONFIG[g].spoilage)}`)
    .join(', ');
}

/** One line per line of `scoreParts`, in its order; the type makes a new line there fail here. */
const WORTH: Record<keyof ScoreParts, () => string> = {
  money: () => 'credits in hand, rounded.',
  goods: () => "every unit in your stock at the colony's price for it that day; it also takes the rounding.",
  plots: () => 'how many plots you own.',
  land: () => `${GAME.plotScore} for each plot you own.`,
  mules: () => 'how many of your plots have a MULE installed.',
  muleValue: () => "each installed MULE at the store's MULE price that day.",
  office: () => `${POLITICS.termScore} for each term you have served in office; 0 in a game without politics.`,
  donated: () =>
    "what you gave the colony's projects, credits plus each good at the store's price on the day you gave it, as your plaques record it, counted one for one: a donation moves Worth from money and goods to this line. 0 in a game without politics.",
  cut: () =>
    `what Collapse takes off every line, office and donations included: 0 unless the colony's air is in Collapse (${COLLAPSE_AIR} or more of ${POLLUTION.airMax}), when the whole sum is multiplied by ${POLLUTION.collapseScore}.`,
  total: () => 'your Worth: money + goods + land + muleValue + office + donated, less the cut. The highest total wins.',
};

export const ADVICE: readonly AdviceLine[] = [
  {
    move: 'claim',
    field: 'LandGrantPlay.ranked',
    when: () =>
      `a plot adds ${GAME.plotScore} to your Worth and makes goods every month after; rank by what it makes over the months left, and a plot beside your others making the same good makes ${ADJACENCY.neighbour} more.`,
  },
  {
    move: 'buyMule',
    field: 'DevelopmentPlay.route',
    when: () =>
      `buy early: the store fills the corral to ${corral()} at upkeep, as its Smithore allows, and a sold-out corral raises next month's price by ${pct(MULE.scarcityUp)}.`,
  },
  {
    move: 'analyse',
    field: 'DevelopmentPlay.route',
    when: () =>
      `before outfitting a plot whose ground you do not know; it costs ${DEVELOPMENT.analysisSeconds} s of ${DEVELOPMENT.fullSeconds}, so analyse only where the answer changes the outfit.`,
  },
  {
    move: 'outfit',
    field: 'Strategy.moneyMaker',
    when: () =>
      `for the good the colony is short of or the export ship wants (${EXPORT_SHIP.wishlist} goods, every ${GAME.exportShipEvery} months): a scarce good sells dear.`,
  },
  {
    move: 'pub',
    field: 'DevelopmentPlay.ifSoldOut',
    when: () =>
      `when the corral is out or your route is done: the pub pays more the earlier you go, ${DEVELOPMENT.pub.base} plus up to ${DEVELOPMENT.pub.start} + ${DEVELOPMENT.pub.perMonth} times the month.`,
  },
  {
    move: 'filter',
    field: 'DevelopmentPlay.route',
    when: () =>
      `when the air nears Collapse (${COLLAPSE_AIR}): Collapse multiplies every player's Worth by ${POLLUTION.collapseScore}, and a filter multiplies a polluting plot's air points by ${POLLUTION.filterFactor}.`,
  },
  {
    move: 'declare',
    field: 'GoodPlay.role',
    when: () =>
      `sell what you hold above next month's needs and the depot's ${UPKEEP.depotCapacity}, buy what you will be short of, and pass on the rest; goods that spoil lose value in stock.`,
  },
  {
    move: 'walk',
    field: 'GoodPlay.walkAway',
    when: () =>
      `never walk past your walk-away price; concede toward it over the ${WALK.goodMs} ms walk rather than at once.`,
  },
  {
    move: 'declare',
    field: 'GoodPlay.hold',
    when: () =>
      `hold units for the export ship's month when its wishlist names the good: it buys at that month's goods auction, from the off-world price down; it calls every ${GAME.exportShipEvery} months.`,
  },
  {
    move: 'declare',
    field: 'Strategy.kind',
    when: () =>
      `as a monopolist, only if your level may corner: buy up a scarce good that spoils less than ${pct(STRATEGIST.cornerMaxSpoilage)} a month, so the others must buy it from you.`,
  },
  {
    move: 'run',
    field: 'Strategy.kind',
    when: () =>
      `as a politician: each term adds ${POLITICS.termScore} to Worth, and the Governor is paid ${POLITICS.pay.governor} a month from the colony fund.`,
  },
];

type Shared = ReadonlyMap<Phase, readonly string[]>;

/** Per phase, the checks every move legal in that phase alone lists, so the manual states them once. */
function sharedChecks(moves: MoveTable): Shared {
  const byPhase = new Map<Phase, (readonly string[])[]>();
  for (const move of Object.values(moves) as MoveDescriptor[]) {
    if (move.phases.length !== 1) continue;
    const phase = move.phases[0]!;
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), move.legalWhen()]);
  }
  const shared = new Map<Phase, readonly string[]>();
  for (const [phase, lists] of byPhase) {
    if (lists.length <= 1) continue;
    const common = lists[0]!.filter((line) => lists.every((l) => l.includes(line)));
    if (common.length > 0) shared.set(phase, common);
  }
  return shared;
}

function moveBlock(move: MoveDescriptor, shared: Shared): string {
  const common = move.phases.length === 1 ? (shared.get(move.phases[0]!) ?? []) : [];
  const own = move.legalWhen().filter((line) => !common.includes(line));
  const lead = common.length ? [`the ${PHASE_NAME[move.phases[0]!]} checks above`] : [];
  const legal = [...lead, ...own];
  const args = move.args.map((a) => (a.values ? `${a.name} (${a.values.join(' | ')})` : `${a.name} (${a.kind})`));
  return [
    `### ${move.type}`,
    `In: ${move.phases.map((p) => PHASE_NAME[p]).join(', ')}.${args.length ? ` Args: ${args.join(', ')}.` : ''}`,
    `Does: ${move.does()}`,
    `Legal when: ${legal.length ? legal.join('; ') : 'always, in those phases'}.`,
    `Cost: ${move.cost ? 'yes, as it says under Does.' : 'free.'}`,
  ].join('\n');
}

function checkAdvice(moves: MoveTable, advice: readonly AdviceLine[]): void {
  for (const line of advice) {
    if (!Object.hasOwn(moves, line.move)) throw new Error(`Advice names a move that does not exist: ${line.move}`);
    if (!OFFERED_FIELDS.has(line.field)) throw new Error(`Advice names a playbook field that does not exist or is not offered: ${line.field}`);
  }
}

/** The manual for these moves and the config as it stands. Throws when an advice line names a move or field that does not exist. */
export function renderManual(moves: MoveTable, advice: readonly AdviceLine[] = ADVICE): string {
  checkAdvice(moves, advice);
  const shared = sharedChecks(moves);
  const phases = (Object.keys(PHASES) as (keyof typeof PHASES)[]).map((p) => {
    const checks = shared.get(p);
    const tail = checks ? ` Every ${PHASE_NAME[p]} move first passes these checks: ${checks.join('; ')}.` : '';
    return `- ${PHASE_NAME[p]}: ${PHASES[p]()}${tail}`;
  });
  const worth = (Object.keys(WORTH) as (keyof ScoreParts)[]).map((part) => `- ${part}: ${WORTH[part]()}`);
  const blocks = (Object.values(moves) as MoveDescriptor[]).map((m) => moveBlock(m, shared));
  const tips = advice.map((a) => `- ${a.move} (${a.field}): ${a.when()}`);
  return [
    '# The manual',
    'The rules of the colony game you play, generated from the game itself.',
    '',
    '## How a month goes',
    ...phases,
    `The game ends after month ${GAME.maxMonths}, or ${GAME.landRushMonths} months after the last free plot is claimed.`,
    '',
    '## How the game is won',
    'At the end the highest Worth wins. Worth is counted line by line:',
    ...worth,
    '',
    '## Moves',
    'Every move you can make, the phases it is legal in, its checks with the refusal each one sends, and whether it costs.',
    '',
    blocks.join('\n\n'),
    '',
    '## When a move is smart',
    'Each line names the move and the playbook field you set to play it.',
    ...tips,
  ].join('\n');
}

/** The manual for the stand-in move descriptors. */
export function defaultManual(advice: readonly AdviceLine[] = ADVICE): string {
  return renderManual(MOVES, advice);
}

/**
 * The seat's own bounds, for its brief: kept out of the shared manual so the manual stays the same for every level. A
 * seat that never corners is not offered the kind 'monopolist', by its reply schema; the shared system block still
 * names it, as one only a cornering level may play to, and the writer refuses it from such a seat (RULE-A3).
 */
export function seatBounds(level: Pick<AiLevelConfig, 'corners'>): string {
  return level.corners
    ? "Your level may corner a good: Strategy.kind 'monopolist' is open to you when a good is scarce."
    : "Your level never aims for a monopoly: never set Strategy.kind to 'monopolist'.";
}
