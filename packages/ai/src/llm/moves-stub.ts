/**
 * A stand-in for WS1's move descriptors, to be deleted when `MOVES` lands in actions.ts, which WS1 owns.
 * Each `legalWhen` line quotes the refusal a check in packages/engine or apps/server sends; numbers come from config.
 */
import {
  analysisSeconds,
  DEVELOPMENT,
  fineStepsWords,
  LOTS,
  GAME,
  MULE,
  mulePriceFor,
  outfitCostFor,
  PERCENT,
  POLITICS,
  POLLUTION,
  PRESTIGE,
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
  | 'commission'
  | 'donate'
  | 'payStrike'
  | 'repair'
  | 'propose'
  | 'voteLaw'
  | 'setBudget'
  | 'callOverrule'
  | 'voteOverrule'
  | 'offerDeal'
  | 'withdrawDeal'
  | 'answerDeal'
  | 'sabotage'
  | 'guard'
  | 'investigate'
  | 'fine'
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
const PRESTIGE_IDS = Object.keys(PRESTIGE);
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
      `Sends the geo drone over 1 to ${DEVELOPMENT.dronePlots} free or listed plots for ${DEVELOPMENT.droneFee} credits: their ground is known at once, in this planning.`,
    legalWhen: () => [
      refused('it is planning', 'Not allowed during <phase>'),
      refused('you have not sent a drone this planning', 'A drone was already used this planning'),
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
      refused('a Sheriff run carries no promise', 'Sheriff candidates make no promise'),
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
      refused('no overrule vote on the tax is open', 'An overrule vote on the tax is called: it holds until it is settled'),
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
  commission: {
    type: 'commission',
    command: 'commission',
    phases: ['planning'],
    does: () =>
      "The Governor commissions a prestige object for the colony; the fund and donors pay for it from the next upkeep, and it builds once paid, on the colony's own grounds.",
    legalWhen: () => [
      refused("the game plays with the colony's council", "This game plays without the colony's council"),
      refused('the votes are over', 'Commission once the votes are over'),
      refused('you are the Governor', 'Only the Governor commissions for the colony'),
      refused('the object is one the colony can build', "The colony can't build that"),
      refused('the colony has none of it', 'The colony already has a <name>'),
      refused('the colony is not already building it', 'The colony is already building the <name>'),
    ],
    cost: null,
    args: [{ name: 'id', kind: 'enum', values: PRESTIGE_IDS }],
  },
  donate: {
    type: 'donate',
    command: 'donate',
    phases: ['planning'],
    does: () =>
      "Gives credits from your money toward the colony's commissioned prestige object; its plaque names you with the sum, and the gift counts toward your vote weight. It leaves your Worth as it was: what you give counts as donated.",
    legalWhen: () => [
      refused("the game plays with the colony's council", "This game plays without the colony's council"),
      refused('it is planning', 'Donate in planning'),
      refused('the object is commissioned and still being funded', 'Nothing is being funded'),
      refused('it is a whole number of credits, at least 1', 'Give at least 1 cr or 1 unit'),
      refused('you have the credits', 'You have <money> cr'),
      refused('the object still needs that many credits', 'The <name> needs only <credits> cr more'),
    ],
    cost: () => ({ line: 'the credits you give' }),
    args: [
      { name: 'id', kind: 'enum', values: PRESTIGE_IDS },
      { name: 'credits', kind: 'number' },
    ],
  },
  payStrike: {
    type: 'payStrike',
    command: 'payStrike',
    phases: ['planning'],
    does: () => "The Governor pays this month's general strikers from the colony fund, so the struck good produces in full.",
    legalWhen: () => [
      refused("the game plays with the colony's council", "This game plays without the colony's council"),
      refused('there is a strike this month', 'There is no strike to pay off'),
      refused('the votes are over', 'Pay the strikers once the votes are over'),
      refused('you are the Governor', 'Only the Governor pays the strikers'),
      refused('the strikers are not paid yet', 'The strikers are already paid'),
      refused('the fund covers what the strikers want', 'The fund has <fund> cr; the strikers want <cost> cr'),
    ],
    cost: null,
    args: [],
  },
  repair: {
    type: 'repair',
    command: 'repair',
    phases: ['planning'],
    does: () => 'The Governor pays from the colony fund to mend a damaged prestige object, so it stands again and counts its prestige.',
    legalWhen: () => [
      refused("the game plays with the colony's council", "This game plays without the colony's council"),
      refused('the votes are over', 'Repair once the votes are over'),
      refused('you are the Governor', 'Only the Governor repairs for the colony'),
      refused('the object is damaged', "The <name> isn't damaged"),
      refused('the fund covers the repair', 'The fund has <fund> cr; the repair costs <cost> cr'),
    ],
    cost: null,
    args: [{ name: 'id', kind: 'enum', values: PRESTIGE_IDS }],
  },
  propose: {
    type: 'propose',
    command: 'propose',
    phases: ['planning'],
    does: () => "The Governor puts a law, a new setting or a repeal to the next planning's ballot; null withdraws it.",
    legalWhen: () => [
      refused('the game plays with a Governor', 'This game plays without a Governor'),
      refused('the votes are over', 'Propose once the votes are over'),
      refused('you are the Governor', 'Only the Governor proposes a law'),
      refused("the law is in the colony's book", "That law is not in the colony's book"),
      refused('it did not fail too recently', 'That proposal failed in month <month>; it can come back in month <month>'),
      refused('a repeal names a law in force', 'That law is not in force'),
      refused('the setting is one the law has', '<law> is set to <settings>'),
      refused('it changes what is in force', 'That law is already in force at that setting'),
      refused('with the book full, it names the law it replaces', '<count> laws are in force: pick the one this replaces'),
    ],
    cost: null,
    args: [{ name: 'proposal', kind: 'enum', values: ["{ kind: 'enact', law, setting, replaces? }", "{ kind: 'repeal', law }", 'null'] }],
  },
  voteLaw: {
    type: 'voteLaw',
    command: 'voteLaw',
    phases: ['planning'],
    does: () => 'Votes yes or no on the open law ballot; a later vote replaces it until the ballot closes.',
    legalWhen: () => [refused('the law ballot is open', 'The law ballot is not open')],
    cost: null,
    args: [{ name: 'yes', kind: 'boolean' }],
  },
  setBudget: {
    type: 'setBudget',
    command: 'setBudget',
    phases: ['planning'],
    does: () => "Shares the colony fund's spare credits between the budget's lines, in whole percent; the buildings, Welfare and the rest are paid from those shares at month end.",
    legalWhen: () => [
      refused('the game plays with a council', "This game plays without the colony's council"),
      refused('the votes are over', 'Set the budget once the votes are over'),
      refused('you are the Governor', 'Only the Governor sets the budget'),
      refused('every line you share is one the colony has', 'The colony has no <line> line yet'),
      refused(`a share is a whole number of percent, in steps of ${POLITICS.budget.step}, up to its line's limit`, `<Line> is 0% to <max>%, in steps of ${POLITICS.budget.step}`),
      refused(`the shares add up to at most ${PERCENT}%`, `The shares add up to <total>%: at most ${PERCENT}%`),
    ],
    cost: null,
    args: [{ name: 'shares', kind: 'enum', values: ['{ projects, welfare, security }'] }],
  },
  callOverrule: {
    type: 'callOverrule',
    command: 'callOverrule',
    phases: ['planning'],
    does: () => "Calls this month's overrule vote on a setting the Governor changed; null takes your own call back.",
    legalWhen: () => [
      refused('the game plays with a council', "This game plays without the colony's council"),
      refused('the votes are over', 'Call an overrule once the votes are over'),
      refused('the colony has a Governor', 'There is no Governor to overrule'),
      refused('you are not the Governor', "The Governor can't overrule themself"),
      refused('no vote is called this month', "<name> already called this month's vote"),
      refused('the target is the tax', 'Only the tax can be overruled in this version'),
      refused('the target is not the no-confidence vote', "Only the Sheriff's inquiry opens a no-confidence vote"),
      refused('the setting changed since the month began', 'The <target> is as it was when the month began'),
      refused('you have a call to withdraw', 'There is no call of yours to withdraw'),
    ],
    cost: null,
    args: [{ name: 'target', kind: 'enum', values: ['tax', 'null'] }],
  },
  voteOverrule: {
    type: 'voteOverrule',
    command: 'voteOverrule',
    phases: ['planning'],
    does: () => "Votes yes (restore the setting the month began with) or no (keep the Governor's) on the open overrule ballot; a later vote replaces it until the ballot closes.",
    legalWhen: () => [refused('the overrule ballot is open', 'The overrule vote is not open')],
    cost: null,
    args: [{ name: 'yes', kind: 'boolean' }],
  },
  offerDeal: {
    type: 'offerDeal',
    command: 'offerDeal',
    phases: ['planning'],
    does: () =>
      'Offers another player a deal card: a pact for a few months, or a promise to vote for a candidate or on the next law; nothing binds until they accept.',
    legalWhen: () => [
      refused('the game plays with deals', 'This game plays without deals'),
      refused('it is planning', 'Cards are offered in planning'),
      refused('it names another player', 'Pick another player'),
      refused(`you have fewer than ${POLITICS.deals.maxOpenOffers} cards waiting for an answer`, 'You have <count> cards waiting for an answer'),
      refused('they have answered your last card', '<name> has not answered your last card'),
      refused(`a pact runs ${POLITICS.deals.pactMonths.join(', ')} months`, `A pact runs ${POLITICS.deals.pactMonths.slice(0, -1).join(', ')} or ${POLITICS.deals.pactMonths.at(-1)} months`),
      refused('you have no pact with them yet', 'You already have a pact with <name>'),
      refused('a vote for an office names an elected office', 'The <office> is not elected yet'),
      refused('an election is left this game', 'No election is left this game'),
      refused('you promise your vote to someone other than yourself', 'Promise your vote to someone else'),
      refused('the candidate is running for that office', '<name> is not running for <office>'),
      refused('a vote on a law has a law up for a vote', 'No law is up for a vote'),
      refused('you have not promised your vote on this ballot', 'You already promised your vote on this ballot'),
    ],
    cost: null,
    args: [
      { name: 'to', kind: 'player' },
      { name: 'terms', kind: 'enum', values: ["{ kind: 'pact' }", "{ kind: 'vote', office, candidate }", "{ kind: 'vote', law: true, yes }"] },
      { name: 'months', kind: 'number', values: POLITICS.deals.pactMonths.map(String) },
    ],
  },
  withdrawDeal: {
    type: 'withdrawDeal',
    command: 'withdrawDeal',
    phases: ['planning'],
    does: () => 'Takes back a card this seat offered and the other player has not answered.',
    legalWhen: () => [
      refused('the game plays with deals', 'This game plays without deals'),
      refused('the card is yours and still waiting for an answer', 'That card is no longer open'),
    ],
    cost: null,
    args: [{ name: 'id', kind: 'enum', values: ["the card's id, 'deal-…'"] }],
  },
  answerDeal: {
    type: 'answerDeal',
    command: 'answerDeal',
    phases: ['planning'],
    does: () => 'Accepts or declines a card offered to this seat; an accepted vote card whose ballot has closed is shown expired.',
    legalWhen: () => [
      refused('it is planning', 'Cards are answered in planning'),
      refused('the card was offered to you and is still waiting for an answer', 'That card is no longer open'),
      refused('a pact accepted is your only pact with them', 'You already have a pact with <name>'),
    ],
    cost: null,
    args: [
      { name: 'id', kind: 'enum', values: ["the card's id, 'deal-…'"] },
      { name: 'accept', kind: 'boolean' },
    ],
  },
  sabotage: {
    type: 'sabotage',
    command: 'sabotage',
    phases: ['planning'],
    does: () =>
      "Orders a crew against another player's plot (a power cut: it makes nothing this month) or a good's price (a rumour: it opens higher or lower at the auction), or withdraws this month's order with null; one order a month, a later one replaces it.",
    legalWhen: () => [
      refused('the game plays with sabotage', 'This game plays without sabotage'),
      refused('it is planning', 'Orders are given in planning'),
      refused("a power cut names another player's plot", "Pick another player's plot"),
      refused('that plot has a MULE making a good', 'That plot makes nothing to cut'),
      refused('a rumour names a good', 'Pick a good'),
      refused('a rumour moves its price up or down', 'A rumour moves a price up or down'),
      refused('you can pay the crew', 'A crew costs <cost> cr; you have <money>'),
    ],
    cost: null,
    args: [
      { name: 'target', kind: 'enum', values: ["{ kind: 'powerCut', tile }", "{ kind: 'rumour', good, dir: 'up' | 'down' }", 'null to withdraw'] },
    ],
  },
  guard: {
    type: 'guard',
    command: 'guard',
    phases: ['planning'],
    does: () => "The Sheriff posts the whole list of plots guarded this month (any owner's); a guarded plot's cut always fails and names its saboteur. It replaces the earlier list.",
    legalWhen: () => [
      refused('the game plays with sabotage', 'This game plays without sabotage'),
      refused('it is planning and the votes are over', 'Guards are posted once the votes are over'),
      refused('you are the Sheriff', 'Only the Sheriff posts guards'),
      refused("every plot is a player's", "Guards watch players' plots"),
      refused('you guard no more plots than the limit', 'You have <count> guards'),
    ],
    cost: null,
    args: [{ name: 'tiles', kind: 'plot' }],
  },
  investigate: {
    type: 'investigate',
    command: 'investigate',
    phases: ['planning'],
    does: () => 'The Sheriff investigates one public incident whose culprit is unknown; it may name the culprit or go cold. One investigation a month.',
    legalWhen: () => [
      refused('the game plays with sabotage', 'This game plays without sabotage'),
      refused('it is planning and the votes are over', 'Investigations are made once the votes are over'),
      refused('you are the Sheriff', 'Only the Sheriff investigates'),
      refused('you have not investigated this month', 'One investigation a month'),
      refused('the incident is public', 'No such incident'),
      refused('its culprit is not yet known', 'That one is solved'),
      refused('it has not been investigated before', 'The trail went cold on that one'),
    ],
    cost: null,
    args: [{ name: 'order', kind: 'enum', values: ["the incident's order id, 'sab-…'"] }],
  },
  fine: {
    type: 'fine',
    command: 'fine',
    phases: ['planning'],
    does: () => 'The Sheriff fines a revealed culprit once; the base is multiplied by any sabotage ban and shared with the victim.',
    legalWhen: () => [
      refused('the game plays with sabotage', 'This game plays without sabotage'),
      refused('it is planning and the votes are over', 'Fines are levied once the votes are over'),
      refused('you are the Sheriff', 'Only the Sheriff fines'),
      refused('the culprit is revealed', 'Only a revealed culprit is fined'),
      refused('the case is not yet fined', 'Already fined'),
      refused('the culprit is not you', "You can't fine yourself"),
      refused(`the amount is ${POLITICS.sheriff.fine.steps[0]} to ${POLITICS.sheriff.fine.steps.at(-1)} in steps of ${POLITICS.sheriff.fine.steps[1]! - POLITICS.sheriff.fine.steps[0]!}`, fineStepsWords()),
    ],
    cost: null,
    args: [
      { name: 'order', kind: 'enum', values: ["the incident's order id, 'sab-…'"] },
      { name: 'amount', kind: 'number', values: POLITICS.sheriff.fine.steps.map(String) },
    ],
  },
};
