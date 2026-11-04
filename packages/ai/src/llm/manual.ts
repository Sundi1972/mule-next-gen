/**
 * The manual: every phase, how Worth is counted, every move and when it is smart, rendered from the move descriptors
 * and config so a rule change cannot leave it stale. Byte-stable for a given config, so it can sit in a cached system
 * block; anything that differs by seat goes in `seatBounds`.
 */
import {
  ADJACENCY,
  DEV_WALK,
  DEVELOPMENT,
  EXPORT_SHIP,
  GAME,
  GOOD_CONFIG,
  GOODS,
  LOTS,
  MULE,
  PERCENT,
  POLITICS,
  POLLUTION,
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

/** Every key of T, at run time; the mapped type makes the compiler reject a missing or unknown key. */
const keysOf = <T>(name: string, keys: { readonly [K in keyof Required<T>]: true }) => Object.keys(keys).map((k) => `${name}.${k}`);

const PLAYBOOK_FIELDS: ReadonlySet<string> = new Set([
  ...keysOf<Strategy>('Strategy', {
    kind: true,
    moneyMaker: true,
    monopolyTarget: true,
    cashFloor: true,
    landTarget: true,
    stances: true,
    reason: true,
  }),
  ...keysOf<PlanningPlay>('PlanningPlay', { drone: true, list: true }),
  ...keysOf<LandGrantPlay>('LandGrantPlay', { ranked: true, pressShare: true, deny: true, planB: true, claims: true, pair: true }),
  ...keysOf<DevelopmentPlay>('DevelopmentPlay', { route: true, timeBudgetMs: true, ifSoldOut: true }),
  ...keysOf<GoodPlay>('GoodPlay', {
    role: true,
    hold: true,
    walkAway: true,
    start: true,
    concedeCrPerS: true,
    bluff: true,
    vsRival: true,
    per: true,
    market: true,
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
    `Everyone reads the colony's stores, prices and plots. Players may send a geo drone over ${DEVELOPMENT.dronePlots} free or listed plots for ${DEVELOPMENT.droneFee} credits (its results arrive when the land grant starts), and list up to ${LOTS.perPlayer} plots or MULEs for the land auction, ${LOTS.maxLotsPerMonth} lots a month from all sellers. In months ${monthsList(POLITICS.electionMonths)} planning opens with an election for ${POLITICS.offices.join(', ')}: announce, then a secret ballot if an office has two or more candidates, then the result. Planning ends when every player is Ready.`,
  landGrant: () =>
    `The light passes over the free plots one at a time in reading order, ${GAME.grantTickMs} ms each, ${GAME.grantSweeps} pass; the first player to press claims the lit plot, up to ${GAME.claimsPerGrant} claims each. It ends after the pass, when no free land is left, or once every player has used their claims or is Done.`,
  landAuction: () =>
    `The listed lots come up one at a time: an intro of ${LOTS.introMs} ms, then a walk of ${LOTS.walkMs} ms where every player but the seller stands as a buyer, unless short of the minimum or leading a MULE when a MULE is up, and walks up to bid. The highest bid at the bell wins; a change of leader in the last ${LOTS.lateMs} ms sets the clock back to it. An unsold lot is kept, or sold to the store for ${pct(LOTS.storePlotShare)} of the ${GAME.plotScore} a plot scores and ${pct(LOTS.storeMuleShare)} of the MULE price for a MULE, as the seller chose. Each month the colony puts one free plot up with a chance of ${pct(LOTS.colonyPlotChance)}. With nothing listed it is skipped.`,
  development: () =>
    `One clock of ${DEVELOPMENT.fullSeconds} s for every player. Each step from one map tile to the next takes ${DEV_WALK.tileSeconds} s; a hungry or sick colonist walks slower. You buy a MULE at the corral, outfit it, and install it on one of your plots; you may analyse ground, fit filters, or end at the pub for cash.`,
  production: () =>
    `Every plot with a MULE makes its good, more on better ground, plus ${ADJACENCY.neighbour} when a neighbour of yours makes the same good, or ${ADJACENCY.cluster} in a cluster of ${ADJACENCY.clusterSize} or more. A raw plot burns Energy (${rawEnergy()}) and makes ${pct(UPKEEP.shortOutputShare)} without it; a Food plot also needs Water. A factory turns inputs from your stock into its good (${(Object.keys(RECIPES) as ProcessedGood[]).map(recipe).join('; ')}) and makes nothing without them.`,
  auction: () =>
    `Goods come up one at a time (${goodList(WALK.order)}). Each has a status screen of ${WALK.statusMs} ms where players pick buyer, seller or pass, then a walk of ${WALK.goodMs} ms: buyers walk up, sellers down, and units trade while a buyer and a seller meet. The store buys and sells there too, and every sale pays the sales tax into the colony fund.`,
  upkeep: () =>
    `Each player eats ${UPKEEP.baseFood} Food and drinks ${UPKEEP.baseWater} Water, plus 1 Food per ${UPKEEP.crewPerFood} crew and 1 Water per ${UPKEEP.crewPerWater}, from their own stock. Your goods spoil (${spoiling()}, rounded down), and anything above ${UPKEEP.depotCapacity} units of a good is lost. Every ${GAME.exportShipEvery} months an export ship calls, buying the ${EXPORT_SHIP.wishlist} goods on its wishlist, announced one month before.`,
};

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
  cut: () =>
    `what Collapse takes off every line, office included: 0 unless the colony's air is in Collapse (${COLLAPSE_AIR} or more of ${POLLUTION.airMax}), when the whole sum is multiplied by ${POLLUTION.collapseScore}.`,
  total: () => 'your Worth: money + goods + land + muleValue + office, less the cut. The highest total wins.',
};

export const ADVICE: readonly AdviceLine[] = [
  {
    move: 'claim',
    field: 'LandGrantPlay.ranked',
    when: () =>
      `a plot adds ${GAME.plotScore} to your Worth and makes goods every month after; rank by what it makes over the months left, and a plot beside your others making the same good makes ${ADJACENCY.neighbour} more.`,
  },
  {
    move: 'claim',
    field: 'LandGrantPlay.deny',
    when: () => 'take a plot before a rival does when it is worth more to them than it costs you to hold.',
  },
  {
    move: 'done',
    field: 'LandGrantPlay.claims',
    when: () =>
      `claim fewer when you cannot pay for a MULE on the plot (${MULE.labour} plus Smithore, then the outfit): a plot without one makes nothing.`,
  },
  {
    move: 'buyMule',
    field: 'DevelopmentPlay.route',
    when: () =>
      `buy early: the corral has a MULE for each plot claimed this month plus ${MULE.spareInCorral}, and a sold-out corral raises next month's price by ${pct(MULE.scarcityUp)}.`,
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
      `when the air nears Collapse (${COLLAPSE_AIR}): Collapse multiplies every player's Worth by ${POLLUTION.collapseScore}, and a filter halves a polluting plot's air points.`,
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
    field: 'GoodPlay.market',
    when: () => `hold units for the export ship's month when its wishlist names the good; it calls every ${GAME.exportShipEvery} months.`,
  },
  {
    move: 'declare',
    field: 'Strategy.monopolyTarget',
    when: () =>
      `only if your level may corner: buy up a scarce good that spoils less than ${pct(STRATEGIST.cornerMaxSpoilage)} a month, so the others must buy it from you.`,
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
    if (!PLAYBOOK_FIELDS.has(line.field)) throw new Error(`Advice names a playbook field that does not exist: ${line.field}`);
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

/** The seat's own bounds, kept out of the shared manual so the manual stays the same for every level. */
export function seatBounds(level: Pick<AiLevelConfig, 'corners'>): string {
  return level.corners
    ? "Your level may corner a good: Strategy.kind 'monopolist' with a monopolyTarget is open to you when a good is scarce."
    : "Your level never aims for a monopoly: never set Strategy.kind to 'monopolist', and keep Strategy.monopolyTarget null.";
}
