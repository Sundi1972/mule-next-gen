import {
  analysisSeconds,
  DEVELOPMENT,
  LOTS,
  MULE,
  mulePriceFor,
  outfitCostFor,
  POLITICS,
  type AuctionSide,
  type GameState,
  type Office,
  type Outfit,
  type Phase,
  type TaxPromise,
} from '@mule/engine';

/**
 * The moves an AI seat makes: exactly the ones a human's phone can send. The
 * server turns each into the same intent a phone sends and runs it through
 * the same checks; the simulator applies it with the same engine calls.
 */
export type AiAction =
  | { type: 'claim'; x: number; y: number }
  | { type: 'buyMule' }
  | { type: 'outfit'; outfit: Outfit }
  | { type: 'install'; x: number; y: number }
  | { type: 'analyse'; x: number; y: number }
  | { type: 'filter'; x: number; y: number }
  | { type: 'pub' }
  | { type: 'declare'; side: AuctionSide }
  | { type: 'walk'; dir: -1 | 0 | 1 }
  /** Run for an office; null withdraws. A Governor run carries a promise (RULE-10). */
  | { type: 'run'; office: Office | null; promise?: TaxPromise }
  /** A secret ballot for a contested office; null clears it. */
  | { type: 'vote'; office: Office; candidate: string | null }
  /** The Governor's sales tax, in whole percent. */
  | { type: 'setTax'; percent: number }
  /** Done with this auction or election stage, or not done after all. */
  | { type: 'done'; done: boolean }
  /** Planning: send the geo drone over one or two free or listed plots. */
  | { type: 'drone'; plots: { x: number; y: number }[] }
  /** Planning: put a plot, or the MULE on one, up for the land auction. */
  | { type: 'list'; item: { kind: 'plot' | 'mule'; x: number; y: number }; minimum: number; unsold: 'store' | 'keep' }
  /** Planning: take one of its listings back. */
  | { type: 'unlist'; id: string };

/** Plays one action. Returns false when the rules refused it (a RuleError), so the hands move on to the next item. */
export type Act = (action: AiAction) => boolean;

/** What a move takes from the seat. */
export interface MoveCost {
  money?: number;
  /** Credits by outfit, for a move whose price is the outfit chosen. */
  moneyByOutfit?: Partial<Record<Outfit, number>>;
  /** Development seconds. */
  seconds?: number;
  alloy?: number;
}

/** One move, described for a reader of the rules: what it is and when the engine refuses it, never when it is smart. */
export interface MoveDescriptor {
  type: AiAction['type'];
  /** The phone command it is. */
  command: string;
  phases: readonly Phase[];
  does(): string;
  /** One line per check, each the refusal text the engine throws. `{phase}` and the like stand for a value it fills in. */
  legalWhen(): readonly string[];
  /** Null when it takes nothing. */
  cost: ((state: GameState, me: string) => MoveCost) | null;
  /** Each field of the move besides its type, in plain words. */
  args: Readonly<Record<string, string>>;
}

/** A move's fields besides its type, each in plain words; the compiler holds them to the move's shape. */
type ArgsOf<A extends AiAction> = { readonly [K in Exclude<keyof A, 'type'>]-?: string };
type Described = { [A in AiAction as A['type']]: MoveDescriptor & { type: A['type']; args: ArgsOf<A> } };

const PHASE = 'Not allowed during {phase}';
const DEVELOPER = [PHASE, 'Your turn is over: you went to the pub'];
const AUCTION = 'The auction is not running';
const PLOT = { x: "the plot's column", y: "the plot's row" };

const DESCRIBED = {
  claim: {
    type: 'claim',
    command: 'claim',
    phases: ['landGrant'],
    does: () => 'Claims the plot that is lit in the land grant, free.',
    legalWhen: () => [PHASE, 'No claims left this month', 'You are done with land this month', 'Not a plot', 'Plot already taken', 'That plot is not lit'],
    cost: null,
    args: PLOT,
  },
  buyMule: {
    type: 'buyMule',
    command: 'buyMule',
    phases: ['development'],
    does: () => 'Buys a MULE at the store and leads it out empty.',
    legalWhen: () => [...DEVELOPER, 'Already leading a MULE', 'The store is out of MULEs', 'Not enough money'],
    cost: (state, me) => ({ money: mulePriceFor(state, me) }),
    args: {},
  },
  outfit: {
    type: 'outfit',
    command: 'outfit',
    phases: ['development'],
    does: () => 'Outfits the MULE it leads to make one good, or as a green belt.',
    legalWhen: () => [...DEVELOPER, 'No MULE to outfit', 'Your MULE bolted: catch it first', 'This MULE is outfitted: re-outfit it', 'Not enough money'],
    cost: (state, me) => ({
      moneyByOutfit: Object.fromEntries((Object.keys(MULE.outfitCost) as Outfit[]).map((o) => [o, outfitCostFor(state, me, o)])),
    }),
    args: { outfit: 'the good the MULE will make, or greenBelt' },
  },
  install: {
    type: 'install',
    command: 'install',
    phases: ['development'],
    does: () => 'Installs the outfitted MULE it leads on one of its plots; a MULE already there runs away.',
    legalWhen: () => [...DEVELOPER, 'The MULE is not outfitted', 'Your MULE bolted: catch it first', 'Not a plot', 'Not your plot'],
    cost: null,
    args: PLOT,
  },
  analyse: {
    type: 'analyse',
    command: 'analyse',
    phases: ['development'],
    does: () => "Analyses any plot's ground, showing its real rating for each raw good; it takes development time.",
    legalWhen: () => [...DEVELOPER, 'Not a plot'],
    cost: (state, me) => ({ seconds: analysisSeconds(state, me) }),
    args: PLOT,
  },
  filter: {
    type: 'filter',
    command: 'filter',
    phases: ['development'],
    does: () => `Fits a pollution filter to one of its plots, for ${DEVELOPMENT.filterAlloy} Alloy.`,
    legalWhen: () => [...DEVELOPER, 'Not a plot', 'Not your plot', 'This plot already has a filter', `A filter needs ${DEVELOPMENT.filterAlloy} Alloy`],
    cost: () => ({ alloy: DEVELOPMENT.filterAlloy }),
    args: PLOT,
  },
  pub: {
    type: 'pub',
    command: 'pub',
    phases: ['development'],
    does: () => 'Ends its development turn at the pub, which pays cash for the time left.',
    legalWhen: () => [...DEVELOPER],
    cost: null,
    args: {},
  },
  declare: {
    type: 'declare',
    command: 'declare',
    phases: ['auction'],
    does: () => "Buys or sells the good that is up (everyone starts as a buyer); during the walk a switch jumps it to the new side's start edge.",
    legalWhen: () => [AUCTION, 'This good has closed', 'You have none to sell', 'Everyone takes part in the auction'],
    cost: null,
    args: { side: "'buyer' or 'seller'" },
  },
  walk: {
    type: 'walk',
    command: 'walk',
    phases: ['landAuction', 'auction'],
    does: () => 'Holds up or down on the walk, or lets go; in the land auction only a buyer walks.',
    legalWhen: () => [AUCTION, 'Not walking yet', 'You passed on this good', "You can't bid on this lot"],
    cost: null,
    args: { dir: '1 up, -1 down, 0 let go' },
  },
  run: {
    type: 'run',
    command: 'run',
    phases: ['planning'],
    does: () => 'Runs for Governor or Sheriff, moving any candidacy for the other office, or withdraws. A Governor run carries a tax promise.',
    legalWhen: () => [
      'This game plays without a Governor',
      'You can run for office in planning',
      'Candidates are closed until the result',
      `${POLITICS.maxGovernorTermsInRow} Governor terms in a row`,
      'The {office} is not elected yet',
      'Sheriff candidates make no promise yet',
      `A tax promise is ${POLITICS.tax.min}% to ${POLITICS.tax.max}%`,
      'Pick a promise to run for Governor',
    ],
    cost: null,
    args: {
      office: "'governor' or 'sheriff', or null to withdraw",
      promise: `a Governor run's promise: cap at a percent from ${POLITICS.tax.min} to ${POLITICS.tax.max}, lower, or hold; none for Sheriff`,
    },
  },
  vote: {
    type: 'vote',
    command: 'vote',
    phases: ['planning'],
    does: () => 'Casts or changes its secret vote for a contested office, or clears it.',
    legalWhen: () => ['No election this month', 'The ballot is not open yet', 'The ballot is closed', 'There is no vote for this office', 'Not a candidate'],
    cost: null,
    args: { office: "'governor' or 'sheriff'", candidate: "a candidate's player id, or null to clear the vote" },
  },
  setTax: {
    type: 'setTax',
    command: 'setTax',
    phases: ['planning'],
    does: () => 'The Governor sets the sales tax, after the election.',
    legalWhen: () => [
      'This game plays without a Governor',
      'The tax is set in planning',
      'Wait for the election to end',
      'Only the Governor sets the tax',
      'The tax can be {low}% to {high}% this month',
    ],
    cost: null,
    args: { percent: 'the tax in whole percent' },
  },
  done: {
    type: 'done',
    command: 'ready',
    phases: ['landGrant', 'landAuction', 'planning', 'auction'],
    does: () =>
      "Done with land for the month, with the lot up, with the election's stage or with the good's auction stage; false takes it back, except in the land grant.",
    legalWhen: () => [],
    cost: null,
    args: { done: 'true for done, false for not done after all' },
  },
  drone: {
    type: 'drone',
    command: 'drone',
    phases: ['planning'],
    does: () =>
      `Sends the geo drone over ${DEVELOPMENT.dronePlots} or fewer free or listed plots, for ${DEVELOPMENT.droneFee} credits; their ground is known from the land grant on.`,
    legalWhen: () => [
      PHASE,
      'A drone is already on its way',
      `Pick 1 to ${DEVELOPMENT.dronePlots} plots`,
      'Not a plot',
      'The drone only flies over free or listed plots',
      'Not enough money',
    ],
    cost: () => ({ money: DEVELOPMENT.droneFee }),
    args: { plots: `1 to ${DEVELOPMENT.dronePlots} plots, each as its column x and row y` },
  },
  list: {
    type: 'list',
    command: 'list',
    phases: ['planning'],
    does: () =>
      "Puts one of its plots, or the MULE on one, up for this month's land auction with a minimum bid; unsold, the store buys it or the seat keeps it.",
    legalWhen: () => [
      'Listings are made in planning',
      'Not a plot',
      'Not your plot',
      'No MULE on that plot',
      'That plot is already up for auction',
      `You can list ${LOTS.perPlayer} lots a month`,
      'The auction is full this month',
      'Pick a minimum of 1 or more',
      'Pick store or keep',
    ],
    cost: null,
    args: {
      item: "the plot ('plot') or the MULE on it ('mule'), at its column x and row y",
      minimum: 'the lowest bid it sells for, in whole credits',
      unsold: "'store' to sell it to the store if nobody bids, 'keep' to keep it",
    },
  },
  unlist: {
    type: 'unlist',
    command: 'unlist',
    phases: ['planning'],
    does: () => 'Takes one of its listings back.',
    legalWhen: () => ['Listings are made in planning', 'No such listing', 'Not your listing'],
    cost: null,
    args: { id: "the listing's id" },
  },
} satisfies Described;

/** Every move an AI seat can make, described: WS2's manual and tools read it. A move with no entry fails the typecheck. */
export const MOVES: Record<AiAction['type'], MoveDescriptor> = DESCRIBED;
