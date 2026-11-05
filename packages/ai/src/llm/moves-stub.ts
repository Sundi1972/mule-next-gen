/**
 * A stand-in for WS1's move descriptors, to be deleted when `MOVES` lands in actions.ts, which WS1 owns.
 * Each `legalWhen` line quotes the refusal a check in packages/engine or apps/server sends; numbers come from config.
 */
import {
  analysisSeconds,
  DEVELOPMENT,
  LOTS,
  GAME,
  MULE,
  mulePriceFor,
  outfitCostFor,
  PERCENT,
  POLITICS,
  POLLUTION,
  SPECIES_PERK,
  TAX,
  type GameState,
  type Outfit,
  type Phase,
  type PlayerId,
} from '@mule/engine';
import type { AiAction } from '../actions.js';
import { outfitName } from '../strategist.js';

/** The phone intents' `type`s, as packages/protocol's MuleIntent has them; @mule/ai does not depend on the protocol. */
export type IntentType =
  | 'ready'
  | 'drone'
  | 'claim'
  | 'buyMule'
  | 'outfit'
  | 'install'
  | 'analyse'
  | 'filter'
  | 'pub'
  | 'declare'
  | 'walk'
  | 'list'
  | 'unlist'
  | 'run'
  | 'vote'
  | 'setTax'
  | 'continue'
  | 'steer'
  | 'act';

export interface MoveArg {
  name: string;
  kind: 'plot' | 'good' | 'outfit' | 'office' | 'player' | 'number' | 'boolean' | 'enum';
  values?: readonly string[];
}

export interface MoveDescriptor<T extends AiAction['type'] = AiAction['type']> {
  type: T;
  /** The phone command it is. */
  command: IntentType;
  /** When it can be sent. */
  phases: readonly Phase[];
  /** One plain sentence; numbers read from config at render time. */
  does: () => string;
  /** One line per rule check, each naming the refusal the server sends otherwise. */
  legalWhen: () => readonly string[];
  /** This player's cost now; null when free. */
  cost: ((state: GameState, me: PlayerId) => { credits?: number; line: string }) | null;
  args: readonly MoveArg[];
}

export type MoveTable = { readonly [T in AiAction['type']]: MoveDescriptor<T> };

const refused = (condition: string, refusal: string) => `${condition} (else: "${refusal}")`;
const pct = (share: number) => `${Math.round(share * PERCENT)}%`;
const OUTFITS = Object.keys(MULE.outfitCost) as Outfit[];
const PLOT: MoveArg = { name: 'plot', kind: 'plot' };
const { min: TAX_MIN, max: TAX_MAX, maxStep: TAX_STEP } = POLITICS.tax;

/** The checks every development move passes first, in the order the server and the engine make them. */
const developing = (): string[] => [
  refused('it is development', 'Not allowed during <phase>'),
  refused('your development time has not run out', 'Your development time is up'),
  refused('you have not gone to the pub this turn', 'Your turn is over: you went to the pub'),
  refused('your colonist is not still walking to the last place you sent it', 'Still walking'),
  refused('your colonist is not still assaying a plot', 'Still assaying'),
];
const notWaiting = refused("in month 1, before the clock starts, you are not already in with your first MULE", "Waiting for the others' first MULEs");
const walkThere = refused('the walk there ends before the clock does', 'Not enough time to walk there');
const aPlot = refused('it names a plot on the map, not the store', 'Not a plot');

export const MOVES: MoveTable = {
  claim: {
    type: 'claim',
    command: 'claim',
    phases: ['landGrant'],
    does: () =>
      `Claims the free plot lit right now, free of charge; the light passes once over the free plots, ${GAME.grantTickMs} ms each, and you may claim ${GAME.claimsPerGrant} plots a grant.`,
    legalWhen: () => [
      refused('it is the land grant', 'Not allowed during <phase>'),
      refused(`you have claimed fewer than ${GAME.claimsPerGrant} plots this grant`, 'No claims left this month'),
      refused('you have not pressed Done with land this month', 'You are done with land this month'),
      aPlot,
      refused('nobody owns the plot', 'Plot already taken'),
      refused('the plot is the one lit now', 'That plot is not lit'),
    ],
    cost: null,
    args: [PLOT],
  },
  buyMule: {
    type: 'buyMule',
    command: 'buyMule',
    phases: ['development'],
    does: () =>
      `Walks to the corral and buys an empty MULE to lead; it costs ${MULE.labour} plus ${MULE.smithorePerMule} Smithore at the posted price, times the store's scarcity factor (up ${pct(MULE.scarcityUp)} after a month the corral sold out), and Gearlings pay ${pct(SPECIES_PERK.gearlingPrice)} of it.`,
    legalWhen: () => [
      ...developing(),
      notWaiting,
      walkThere,
      refused('you are not already leading a MULE', 'Already leading a MULE'),
      refused('the corral has a MULE left', 'The store is out of MULEs'),
      refused('you have the price in hand', 'Not enough money'),
    ],
    cost: (state, me) => {
      const credits = mulePriceFor(state, me);
      return { credits, line: `${credits} credits for an empty MULE` };
    },
    args: [],
  },
  outfit: {
    type: 'outfit',
    command: 'outfit',
    phases: ['development'],
    does: () =>
      `Fits the MULE you lead where you stand: for a raw good or a green belt at its outfitter, for a factory good at the works counter. It costs ${OUTFITS.map((o) => `${outfitName(o)} ${MULE.outfitCost[o]}`).join(', ')}; Gearlings pay ${pct(SPECIES_PERK.gearlingPrice)} of it.`,
    legalWhen: () => [
      ...developing(),
      refused('you are leading a MULE', 'No MULE to outfit'),
      refused('you have the outfit price in hand', 'Not enough money'),
    ],
    cost: (state, me) => ({ line: OUTFITS.map((o) => `${outfitName(o)} ${outfitCostFor(state, me, o)}`).join(', ') }),
    args: [{ name: 'outfit', kind: 'outfit', values: OUTFITS }],
  },
  install: {
    type: 'install',
    command: 'install',
    phases: ['development'],
    does: () =>
      'Walks the outfitted MULE you lead to one of your plots and installs it; a MULE already there is replaced and runs away. A plot without a MULE makes nothing.',
    legalWhen: () => [
      ...developing(),
      notWaiting,
      aPlot,
      walkThere,
      refused('the MULE you lead is outfitted', 'The MULE is not outfitted'),
      refused('you own the plot', 'Not your plot'),
    ],
    cost: null,
    args: [PLOT],
  },
  analyse: {
    type: 'analyse',
    command: 'analyse',
    phases: ['development'],
    does: () =>
      `Walks to any plot, owned or free, and analyses its ground: you alone learn its real rating for every good and its hazards. It takes ${DEVELOPMENT.analysisSeconds} s of your ${DEVELOPMENT.fullSeconds} s, a Mollox ${pct(SPECIES_PERK.molloxAnalysis)} of that.`,
    legalWhen: () => [...developing(), notWaiting, aPlot, walkThere],
    cost: (state, me) => ({ line: `${analysisSeconds(state, me)} s of development time` }),
    args: [PLOT],
  },
  filter: {
    type: 'filter',
    command: 'filter',
    phases: ['development'],
    does: () =>
      `Walks to one of your plots and fits a filter for ${DEVELOPMENT.filterAlloy} Alloy from your stock; it multiplies the plot's air pollution by ${POLLUTION.filterFactor} and stops it spreading.`,
    legalWhen: () => [
      ...developing(),
      notWaiting,
      aPlot,
      walkThere,
      refused('you own the plot', 'Not your plot'),
      refused('the plot has no filter yet', 'This plot already has a filter'),
      refused(`you hold ${DEVELOPMENT.filterAlloy} Alloy`, `A filter needs ${DEVELOPMENT.filterAlloy} Alloy`),
    ],
    cost: () => ({ line: `${DEVELOPMENT.filterAlloy} Alloy from your stock` }),
    args: [PLOT],
  },
  pub: {
    type: 'pub',
    command: 'pub',
    phases: ['development'],
    does: () =>
      `Walks to the pub and ends your development turn for cash: ${DEVELOPMENT.pub.base} plus (${DEVELOPMENT.pub.start} + ${DEVELOPMENT.pub.perMonth} times the month) times the share of your time left when you get there. A MULE you lead runs off.`,
    legalWhen: developing,
    cost: null,
    args: [],
  },
  declare: {
    type: 'declare',
    command: 'declare',
    phases: ['auction'],
    does: () =>
      "Takes a side for the good that is up: buyer, seller or pass. On the status screen it sets where you start; during the walk a switch jumps you back to the new side's start edge, so it never trades at once, and takes back your Done.",
    legalWhen: () => [
      refused('a good is up in the goods auction', 'The auction is not running'),
      refused('to sell, you hold at least one unit of the good', 'You have none to sell'),
    ],
    cost: null,
    args: [{ name: 'side', kind: 'enum', values: ['buyer', 'seller', 'pass'] }],
  },
  walk: {
    type: 'walk',
    command: 'walk',
    phases: ['auction', 'landAuction'],
    does: () =>
      'Moves you on the board during a walk: 1 up, -1 down, 0 stand still. A buyer walks up to bid more, a seller down to ask less, and units trade while a buyer and a seller meet; at the land auction the highest bid at the bell wins the lot.',
    legalWhen: () => [
      refused('in the goods auction, a good is up', 'The auction is not running'),
      refused("the walk has started, after the good's status screen or the lot's intro", 'Not walking yet'),
      refused('in the goods auction, you did not pass on this good', 'You passed on this good'),
      refused('at the land auction, you stand as a buyer: not the seller, the minimum in hand, and no MULE in tow when a MULE is up', "You can't bid on this lot"),
    ],
    cost: null,
    args: [{ name: 'dir', kind: 'enum', values: ['1', '0', '-1'] }],
  },
  drone: {
    type: 'drone',
    command: 'drone',
    phases: ['planning'],
    does: () =>
      `Sends the geo drone over 1 to ${DEVELOPMENT.dronePlots} free or listed plots for ${DEVELOPMENT.droneFee} credits: its results arrive when the land grant starts.`,
    legalWhen: () => [
      refused('it is planning', 'Not allowed during <phase>'),
      refused('no drone of yours is on its way', 'A drone is already on its way'),
      refused(`1 to ${DEVELOPMENT.dronePlots} plots`, `Pick 1 to ${DEVELOPMENT.dronePlots} plots`),
      refused('each plot is free or listed', 'The drone only flies over free or listed plots'),
      refused(`you have ${DEVELOPMENT.droneFee} credits`, 'Not enough money'),
    ],
    cost: () => ({ credits: DEVELOPMENT.droneFee, line: `${DEVELOPMENT.droneFee} credits` }),
    args: [{ name: 'plots', kind: 'plot' }],
  },
  list: {
    type: 'list',
    command: 'list',
    phases: ['planning'],
    does: () =>
      `Puts one of your plots, or the MULE on it, up for this month's land auction at a minimum you set; unsold, the lot is kept or sold to the store, as you chose. Up to ${LOTS.perPlayer} lots each, ${LOTS.maxLotsPerMonth} a month from all sellers.`,
    legalWhen: () => [
      refused('it is planning', 'Listings are made in planning'),
      refused('it names one of your plots', 'Not your plot'),
      refused('for a MULE, the plot has one', 'No MULE on that plot'),
      refused('the plot is not up for auction already', 'That plot is already up for auction'),
      refused(`you have fewer than ${LOTS.perPlayer} lots up`, `You can list ${LOTS.perPlayer} lots a month`),
      refused(`fewer than ${LOTS.maxLotsPerMonth} lots are up`, 'The auction is full this month'),
      refused('the minimum is a whole number, 1 or more', 'Pick a minimum of 1 or more'),
      refused('unsold is store or keep', 'Pick store or keep'),
    ],
    cost: null,
    args: [
      { name: 'item', kind: 'enum', values: ['plot', 'mule'] },
      PLOT,
      { name: 'minimum', kind: 'number' },
      { name: 'unsold', kind: 'enum', values: ['store', 'keep'] },
    ],
  },
  unlist: {
    type: 'unlist',
    command: 'unlist',
    phases: ['planning'],
    does: () => 'Takes one of your listings back before the land auction.',
    legalWhen: () => [
      refused('it is planning', 'Listings are made in planning'),
      refused('the listing exists', 'No such listing'),
      refused('it is yours', 'Not your listing'),
    ],
    cost: null,
    args: [{ name: 'id', kind: 'enum' }],
  },
  run: {
    type: 'run',
    command: 'run',
    phases: ['planning'],
    does: () =>
      `Runs for an office in the next election, moving any run for the other one; null withdraws. Elections open planning in months ${POLITICS.electionMonths.join(', ')}. A Governor run carries a tax promise: lower, hold, or a cap of ${TAX_MIN}% to ${TAX_MAX}%.`,
    legalWhen: () => [
      refused('the game plays with a Governor', 'This game plays without a Governor'),
      refused('it is planning', 'You can run for office in planning'),
      refused("candidates are open: not from the ballot until the result, nor in an election month's announce after month 1", 'Candidates are closed until the result'),
      refused(`for Governor, you have not served ${POLITICS.maxGovernorTermsInRow} Governor terms in a row`, `${POLITICS.maxGovernorTermsInRow} Governor terms in a row`),
      refused(`the office is one that is elected: ${POLITICS.offices.join(', ')}`, 'The <office> is not elected yet'),
      refused('a Sheriff run carries no promise', 'Sheriff candidates make no promise yet'),
      refused(`a cap promise is a whole ${TAX_MIN}% to ${TAX_MAX}%`, `A tax promise is ${TAX_MIN}% to ${TAX_MAX}%`),
      refused('a Governor run carries a promise', 'Pick a promise to run for Governor'),
    ],
    cost: null,
    args: [
      { name: 'office', kind: 'office', values: POLITICS.offices },
      { name: 'promise', kind: 'enum', values: ['lower', 'hold', 'cap'] },
    ],
  },
  vote: {
    type: 'vote',
    command: 'vote',
    phases: ['planning'],
    does: () => 'Casts or changes your secret vote for a contested office in the ballot; null clears it. A pick after Done still counts.',
    legalWhen: () => [
      refused('it is planning in an election month', 'No election this month'),
      refused('the ballot has opened', 'The ballot is not open yet'),
      refused('the ballot has not closed', 'The ballot is closed'),
      refused('the office has two or more candidates', 'There is no vote for this office'),
      refused('the candidate runs for it', 'Not a candidate'),
    ],
    cost: null,
    args: [
      { name: 'office', kind: 'office', values: POLITICS.offices },
      { name: 'candidate', kind: 'player' },
    ],
  },
  setTax: {
    type: 'setTax',
    command: 'setTax',
    phases: ['planning'],
    does: () =>
      `The Governor sets the sales tax on every sale, paid into the colony fund, in whole percent; it starts at ${pct(TAX.salesTax)}, stays within ${TAX_MIN}% to ${TAX_MAX}%, and moves at most ${TAX_STEP} points from the month's starting rate.`,
    legalWhen: () => [
      refused('the game plays with a Governor', 'This game plays without a Governor'),
      refused('it is planning', 'The tax is set in planning'),
      refused("this month's election, if any, is over", 'Wait for the election to end'),
      refused('you are the Governor', 'Only the Governor sets the tax'),
      refused(`the percent is whole, at most ${TAX_STEP} from the month's starting rate, and ${TAX_MIN}% to ${TAX_MAX}%`, 'The tax can be <low>% to <high>% this month'),
    ],
    cost: null,
    args: [{ name: 'percent', kind: 'number' }],
  },
  done: {
    type: 'done',
    command: 'ready',
    phases: ['planning', 'landGrant', 'landAuction', 'auction'],
    does: () =>
      "Done with this stage, or with false not done after all: the election's announce or ballot, a lot's intro or walk, a good's status screen or walk. In the land grant it ends your claims for the month and cannot be taken back.",
    legalWhen: () => [],
    cost: null,
    args: [{ name: 'done', kind: 'boolean' }],
  },
};
