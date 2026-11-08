import type { AuctionSide, BoardZones, CanRun, CeremonyBeat, BudgetLine, DealCard, DealOffer, DevPlace, Election, InquiryRecord, Overrule, OverruleTarget, OverruleWhy, SabotageOrder, SabotageTarget, EventEffect, EventKey, EventKind, EventWeight, FundLine, FundSource, Good, LawId, LawImpact, LawProposal, GoodReceipt, Ground, MonthEvent, Office, OfficeResult, Outfit, Phase, PlayerId, PrestigeId, ScoreParts, SkipReason, SpecialField, Species, StatusRow, Stock, TaxPromise, Terrain, TileTrait, VoteWeight } from '@mule/engine';
export type { ChatMessage, ClientEnvelope, ServerEnvelope, TableView } from '@tabletop/core/protocol';

/**
 * The M.U.L.E. part of the protocol. Rooms, seats, boards, chat and clock
 * sync come from @tabletop/core; these are the game moves a phone sends and
 * the game view each screen receives.
 */
export type MuleIntent =
  /** Ready to move on; at the auction, done with this stage of the current good. */
  | { type: 'ready' }
  /** Planning: send the geo drone over one or two free plots. */
  | { type: 'drone'; plots: { x: number; y: number }[] }
  /** Land grant: claim the plot that is lit. The coordinates say which plot the player saw lit. */
  | { type: 'claim'; x: number; y: number }
  /**
   * Development's moves, by name. No screen sends them since development is steered (C14): the server refuses them,
   * and the floor plays each through `act`. They stay while the AI's move catalogue (packages/ai actions.ts) names
   * them as its moves' commands.
   */
  | { type: 'buyMule' }
  | { type: 'outfit'; outfit: Outfit }
  | { type: 'install'; x: number; y: number }
  | { type: 'analyse'; x: number; y: number }
  | { type: 'filter'; x: number; y: number }
  | { type: 'pub' }
  /** Auction: buy, sell or pass on the good that is up. During the walk a switch jumps you to the new side's start edge. */
  | { type: 'declare'; side: AuctionSide }
  /** Auction, during the walk: hold up, hold down, or let go. The land auction's walk uses it too. */
  | { type: 'walk'; dir: 'up' | 'down' | 'stop' }
  /** Goods auction, during the walk: one tap on Up or Down, one price step (A-6, UX audit G-2). */
  | { type: 'walkStep'; dir: 'up' | 'down' }
  /** Planning: put a plot, or the MULE on one, up for the land auction, with a minimum and what happens if nobody bids it. */
  | { type: 'list'; item: { kind: 'plot' | 'mule'; x: number; y: number }; minimum: number; unsold: 'store' | 'keep' }
  /** Planning: take one of your listings back. */
  | { type: 'unlist'; id: string }
  /** Planning, until the election's ballot opens: run for an office (moving any candidacy for the other one); null withdraws. A Governor run needs a promise (RULE-10). */
  | { type: 'run'; office: Office | null; promise?: TaxPromise }
  /** Election, ballot: cast or change your secret vote for a contested office; null clears it. */
  | { type: 'vote'; office: Office; candidate: string | null }
  /** Planning, after the election: the Governor sets the sales tax in whole percent. */
  | { type: 'setTax'; percent: number }
  /** Planning: offer another player a deal card: a pact (with its months) or your own vote promise. */
  | { type: 'offerDeal'; offer: DealOffer }
  /** Planning: take back a card not yet answered. */
  | { type: 'withdrawDeal'; id: string }
  /** Planning: accept or decline a card offered to you. */
  | { type: 'answerDeal'; id: string; accept: boolean }
  /** Planning: order sabotage against a target, or withdraw this month's order with null (slice 4). */
  | { type: 'sabotage'; target: SabotageTarget | null }
  /** The Sheriff, after the votes: the whole list of tiles guarded this month. */
  | { type: 'guard'; tiles: number[] }
  /** The Sheriff, after the votes: investigate a public order whose culprit is unknown. */
  | { type: 'investigate'; order: string }
  /** The Sheriff: fine an order's culprit; `amount` is the base, before the ban's multiplier. */
  | { type: 'fine'; order: string; amount: number }
  /** Planning, once the votes are over: the Governor's whole budget, whole-percent shares per line (slice 5). */
  | { type: 'setBudget'; shares: Record<BudgetLine, number> }
  /** Planning, once the votes are over: call this month's overrule vote; null withdraws your call. */
  | { type: 'callOverrule'; target: OverruleTarget | null }
  /** The overrule (or no-confidence) ballot: yes undoes it; a later vote replaces it until the ballot closes. */
  | { type: 'voteOverrule'; yes: boolean }
  /** After RC. Planning: the Sheriff opens this term's inquiry into the Governor. */
  | { type: 'openInquiry' }
  /** Planning, after the votes: the Governor commissions a prestige object for the colony. */
  | { type: 'commission'; id: PrestigeId }
  /** Planning: give credits and goods toward the object being funded; the plaque names the donor. */
  | { type: 'donate'; id: PrestigeId; credits: number; goods?: Partial<Record<Good, number>> }
  /** Planning, after the votes: the Governor repairs a damaged object from the fund. */
  | { type: 'repair'; id: PrestigeId }
  /** Planning, after the votes: the Governor pays this month's general strikers from the fund. */
  | { type: 'payStrike' }
  /** Planning, once the votes are over: the Governor puts a law, a new setting or a repeal to the next planning's ballot; null withdraws it. */
  | { type: 'propose'; proposal: LawProposal | null }
  /** The law ballot: yes or no; a later vote replaces it until the ballot closes. */
  | { type: 'voteLaw'; yes: boolean }
  /** Planning: the host ends planning with players not yet Ready; in the election's announce or ballot, it goes on without players not Done. */
  | { type: 'continue' }
  /**
   * Development: the stick's direction, sent on change. Each component is in [-1, 1] in steps of 1/8, and the vector's
   * length is at most 1. `tick` is the development tick the phone applied it at, when the phone predicts.
   */
  | { type: 'steer'; x: number; y: number; tick?: number }
  /** Development: the one button; it does what the player's `reach` says. */
  | { type: 'act' }
  /** Production: this person asks to speed the show up; once every person at the table has, the rest plays faster (ws6-ux AM-19, B-AC-20). */
  | { type: 'hurry' };

export const EMOTES = ['Deal?', 'Nice!', 'Traitor!', 'Ha!', 'Help!'] as const;
export type Emote = (typeof EMOTES)[number];

export interface TileView {
  x: number;
  y: number;
  terrain: Terrain;
  peaks: number;
  owner: string | null;
  outfit: Outfit | null;
  /** Plot pollution, 0 clean to 3 toxic. Public: everyone can see the smog. */
  pollution: number;
  filter: boolean;
  /** Only for a player who analysed this plot: its real ground rating per raw good. */
  ground?: Ground;
  /** Only for the plot's owner or a player who analysed it: its hazard traits. */
  traits?: TileTrait[];
  /** The plot's special field, while it lasts. Public: every viewer, phone and TV, sees it; only the ground is private. */
  special?: SpecialField;
}

export interface PlayerView {
  id: string;
  name: string;
  isAi: boolean;
  color: string;
  /** The player's colour index, the one their seat chose in the lobby. */
  slot: number;
  species: Species;
  money: number;
  /**
   * Worth: the player's score if the game ended now (engine scoreParts().total), in credits, in any phase.
   * Public in every view, the TV's too. Only the total: its parts go to the player's own `me.worthParts` and nowhere else.
   */
  worth: number;
  /**
   * The `worth` this player's row showed at last month's end (upkeep), recorded then and never recomputed, so the
   * change since last month is the number shown now against the number shown then. Null in month 1.
   */
  lastWorth: number | null;
  /**
   * While the air is in Collapse, this player's Worth before the cut (scoreParts' total plus its cut: money + goods +
   * land + muleValue + office + donated, rounded as scoreParts rounds); null outside Collapse. Public like `worth`, a total only.
   */
  worthBeforeCut: number | null;
  plots: number;
  ready: boolean;
  /** True once they went to the pub this development phase. */
  doneDeveloping: boolean;
  /** Where their colonist is in development, public like every place; null outside development. */
  colonist: ColonistView | null;
  /**
   * How hunger and sickness slow this colonist: live during development, then kept as the month's through its end
   * (upkeep, and game over after the last month), where the month end names who went hungry. Null otherwise. Public:
   * every screen shows it.
   */
  condition: {
    /** 0..1 of the month's Food held (engine foodShare). */
    foodShare: number;
    /** The month's Food need of this player's household (engine needsOf), so a screen can say "ate n of m". */
    foodNeed: number;
    sick: boolean;
    /** Why it is sick (engine playerEventReason): the air, its own pollution, or plain chance; null when well. */
    sickBecause: 'air' | 'pollution' | 'chance' | null;
    /** hunger × sickness, 1 is normal; species is not in it (engine pace() adds it). */
    conditionPace: number;
  } | null;
  /** 0..100, public on every screen, the TV's too (S3-RULE-7). The server always sends it; optional only so hand-built test players still type. */
  reputation?: number;
}

/** A colonist in development. Times are the server's epoch ms, like phaseEndsAt. */
export interface ColonistView {
  /** The tile under it, or the store while it is in the hall. */
  at: DevPlace;
  /** While it stands on a plot for a geo analysis: when the analysis is done. */
  assayUntil: number | null;
  /**
   * Steered development: where it stands, absent until the server steers. In map tiles when `space` is 'map', in the
   * hall plan's units (`HALL.w` × `HALL.h`) when it is 'hall'.
   */
  x?: number;
  y?: number;
  space?: ColonistSpace;
  facing?: 'left' | 'right';
  moving?: boolean;
  /** The MULE on its lead, outfitted or not, and where it trots. */
  lead?: ColonistLead | null;
  /** How fast it walks, 1 is normal. */
  pace?: number;
  /** Wolf pelts it carries to sell at the store. */
  pelts?: number;
  /** The moment it is in, if any. */
  encounter?: 'choose' | 'chase' | 'fight' | null;
  /** true while the colonist limps from a wolf bite; absent means not bitten */
  bitten?: boolean;
}

/** Out on the map, or inside the store's hall. */
export type ColonistSpace = 'map' | 'hall';

/** The MULE on its lead. `x` and `y` are in the same units as its colonist's: map tiles, or hall-plan units in the hall. */
export interface ColonistLead {
  good: Outfit | null;
  x: number;
  y: number;
}

/** What the one button does where the player stands: its words, a detail such as a price, and whether it works. */
export interface ReachView {
  verb: string;
  detail: string | null;
  enabled: boolean;
}

/** A wolf of a pack on the floor (arcade RULE-4), its position rounded as the colonists' are. */
export interface FrameWolf {
  x: number;
  y: number;
  /** Circling; crouched to lunge (the warning); lunging; open after a miss; hurt after a strike or a bite. */
  state: 'prowl' | 'tell' | 'lunge' | 'open' | 'hurt';
  /** Where it aims, a map position: set while it crouches (tell) and lunges, null otherwise. */
  target: { x: number; y: number } | null;
}

/** A pack round a colonist: whose, and the stage of the meeting (the same as that colonist's ColonistView.encounter). */
export interface FramePack {
  who: string;
  stage: 'choose' | 'chase' | 'fight';
  /** The tick the stage began. */
  sinceTick: number;
  /** Where the stage began, a map position: a chase gives up far enough from it, and a fight stays round it. */
  centre: { x: number; y: number };
  /** In a fight: the strikes that landed on wolves, and the bites taken. */
  strikes: number;
  bites: number;
  wolves: FrameWolf[];
}

/**
 * The moments on the floor this tick (AM-28), straight from the floor's state. Absent from the frame when there is no
 * pack, no glint, no scramble yet this turn, no bolted MULE and no stunned colonist.
 */
export interface FrameMoments {
  packs: FramePack[];
  /** The glint lit, by its tile: x and y are the tile's (whole numbers), and it is drawn at the tile's middle (+0.5). */
  glint: { x: number; y: number; untilTick: number } | null;
  /**
   * The turn's corral scramble, from its call to the end of the turn: `over` is null while it runs, then how it ended;
   * `got` the needers that got a MULE from it, in order; `leftOut` the needers who went without, filled once it is over.
   */
  scramble: { untilTick: number; needers: string[]; got: string[]; over: 'empty' | 'time' | 'everyone' | null; leftOut: string[] } | null;
  /**
   * The seats whose MULE bolted after a lost fight and is not caught yet, running or standing. The MULE is at that
   * colonist's `lead`, in map tiles even while its colonist is in the hall.
   */
  bolted: string[];
  /** Colonists stunned by a lost fight: whose, and the tick the stun ends (it is gone from the frame on that tick). */
  stunned: { who: string; untilTick: number }[];
}

/** One development tick's positions for every screen, sent beside the full view. */
export interface DevFrame {
  tick: number;
  /** ms since development started, at this tick. */
  at: number;
  /** Each colonist's position: map tiles when `space` is 'map', the hall plan's units (`HALL.w` × `HALL.h`) when 'hall'. */
  colonists: {
    id: string;
    x: number;
    y: number;
    space: ColonistSpace;
    facing: 'left' | 'right';
    moving: boolean;
    lead: ColonistLead | null;
  }[];
  /** The moments' lines everyone sees this tick. */
  beats: string[];
  /** The moments' state this tick; absent while none is on (AM-28). */
  moments?: FrameMoments;
}

export interface MyView {
  id: string;
  /** Steered development: what this player's button does now; absent until the server steers. */
  reach?: ReachView;
  /** Steered development: the moments' lines for this player. */
  banners?: string[];
  species: Species;
  stock: Stock;
  carriedMule: Outfit | 'empty' | null;
  /**
   * The MULE this player leads came off one of their plots by a swap (AM-35): if the turn ends with it still on the
   * lead it goes to the corral, so the walking screen warns. Only on this player's own view; absent reads as no.
   */
  leadsSwapped?: true;
  claimsLeft: number;
  hungry: boolean;
  sick: boolean;
  /** Food and Water this player's household and crew need each month. */
  needs: { food: number; water: number };
  /** What this player needs of each good this month: the engine's monthNeeds. */
  monthNeeds: Stock;
  /** Epoch ms when the one development clock runs out, the same for every seat; null outside development. */
  devEndsAt: number | null;
  /** Seconds of development time this player got this month. */
  devSeconds: number;
  /** What this player's plots made in the latest production, or null before the first harvest. */
  produced: Stock | null;
  /** What this player pays for a MULE and for each outfit. */
  mulePrice: number;
  outfitCosts: Record<Outfit, number>;
  /** Free or listed plots the geo drone flew over this month; set until the land grant frees the drone. */
  droneOrder: { x: number; y: number }[];
  /**
   * The plots this month's drone surveyed, from the moment it is sent until the month ends: the land grant's rail says
   * "Your drone: …" while one is lit (H-3). Only on this player's own view; absent reads as none.
   */
  droneFound?: { x: number; y: number }[];
  /** This player's own side of the election; null when the game plays without politics. */
  politics: MyPoliticsView | null;
  /** True once this player has installed a MULE in this development turn, and until their next one starts. */
  installedThisTurn: boolean;
  /** This player's own Worth line by line, the Collapse cut included. Private: no other view carries anyone's parts. */
  worthParts: ScorePartsView;
  /** This player's own cards; null with politics off. Optional only for older fixtures: the server always sends it. */
  deals?: MyDealsView | null;
}

/**
 * One news line and the seats it names: one id for each name in the words, in their order, repeats kept ("Ossa broke a
 * promise to Brix: a vote for Brix" names ossa, brix, brix), so a screen can mark each name where it stands. A screen
 * that wants only who is named dedupes.
 */
export interface NewsLine {
  text: string;
  who: PlayerId[];
}

/** A player's own deal cards (slice 3). */
export interface MyDealsView {
  /** Every card this player is a party to, newest first (partyTo). Never a card between two others unless broken. */
  cards: DealCard[];
  /** Offers this player may still make now: POLITICS.deals.maxOpenOffers minus their open ones. */
  offersLeft: number;
  /** The lengths a pact may run (POLITICS.deals.pactMonths). */
  pactMonths: number[];
}

/** A public sabotage order as every screen sees it: an incident (slice 4). */
export interface IncidentView {
  id: string;
  month: number;
  kind: SabotageTarget['kind'];
  victim: string | null;
  at: { x: number; y: number } | null;
  /** null only when the crop is unknown: a pending power cut on a plot with no MULE. A settled cut always names the crop it hit (order.good). */
  good: Good | null;
  dir?: 'up' | 'down';
  worked: boolean;
  /** Only when the culprit is public, or on the orderer's own list. */
  culprit: string | null;
  /** How the culprit became known; null while it is not (an unseen worked cut), whoever is looking. */
  how: 'guard' | 'caught' | 'investigation' | null;
  investigated: boolean;
  fine: { due: number; paid: number; toVictim: number; by: 'sheriff' | 'standard' } | null;
  /** The Sheriff's bounty for naming this culprit, by a guard or an investigation (slice 4 AM-11); null for none. Optional only for older fixtures. */
  bounty?: { to: string; paid: number } | null;
}

/** The colony budget as every screen sees it (slice 5). */
export interface BudgetView {
  /** The lines offered, in order: the share now and at the month's start, the bounds, and the credits it pays at today's fund. */
  lines: { line: BudgetLine; share: number; start: number; maxShare: number; step: number; credits: number; maxCredits: number | null }[];
  /** 100 − Σ shares: stays in the fund. */
  kept: number;
  /** Who Welfare would go to now, or null. */
  welfareTo: string | null;
  /** The Governor who set it, or null for the default. */
  setBy: string | null;
  /** True while the budget holds: never in RC; after RC, from any overrule call until planning ends. */
  frozen: boolean;
}

/** An overrule or no-confidence vote as every screen sees it (slice 5). Never holds another player's ballot. */
export interface OverruleView {
  target: OverruleTarget;
  caller: string;
  stage: Overrule['stage'];
  /** What a yes restores and what stands now; for 'confidence', the Governor in question. */
  restores: { tax: number } | { shares: Record<BudgetLine, number> } | { governor: string };
  stands: { tax: number } | { shares: Record<BudgetLine, number> } | { governor: string };
  voted: string[];
  done: string[];
  waitingFor: string[];
  clockMs: number;
  revealMs: number;
  total: number;
  needed: number;
  result: { passed: boolean; yes: number; no: number } | null;
}

/** Only on the owner's phone: their candidacy, their secret ballot, whether they may run now for each elected office, and what weighs their vote. */
export interface MyPoliticsView {
  running: Office | null;
  ballot: Partial<Record<Office, string>>;
  canRun: Partial<Record<Office, CanRun>>;
  /** Sales tax this player has paid over the game, in credits. */
  paid: number;
  reputation: number;
  /** Their own vote on the open law ballot, yes or no; null when they have cast none. Never anyone else's. */
  lawBallot?: boolean | null;
  /**
   * The Governor's own view only, in planning while no vote is open: what each proposal they may make would cost each
   * player a month (RULE-45), keyed `<law>:<setting>` for each enact and `repeal:<law>` for each law in force.
   */
  candidates?: Record<string, Record<string, LawImpact>>;
  /** This player's promised votes (promisedVotes), for the ballot's "You promised". Optional only for older fixtures. */
  promised?: { election: Partial<Record<Office, { candidate: string; to: string[] }>>; law: { yes: boolean; to: string[] } | null };
  /** This player's own sabotage (slice 4), their phone only; null with sabotage off. Optional only for older fixtures. */
  sabotage?: {
    /** This month's pending order. */
    order: SabotageTarget | null;
    canOrder: true | 'off' | 'notPlanning';
    /** The crew cost due at this month's upkeep. */
    owed: number;
    /**
     * Every order this player made. On this list `culprit` is always them. `public` means the order is on the public
     * record: every screen lists it as an incident, because it worked, was caught, or its culprit was revealed. It does
     * NOT mean anyone knows it was them: others know only when `how` is not null (a guard, caught on the spot, or an
     * investigation). A worked cut nobody saw is `public: true` with `how: null`.
     */
    /**
     * outcome 'void': the order found nothing to do (the plot was sold, had no MULE, or was the orderer's own); it was not
     * charged, and only the orderer's own list shows it. Its `public` is false and its `how` null.
     */
    mine: (IncidentView & { public: boolean; outcome: SabotageOrder['outcome'] | 'void' })[];
  } | null;
  /** The Sheriff's desk (slice 4), only on the sitting Sheriff's view. Optional only for older fixtures. */
  sheriff?: {
    canAct: true | 'off' | 'notPlanning' | 'votesOpen';
    /** Tile indices guarded this month. */
    guards: number[];
    max: number;
    investigationsLeft: number;
    /** Tile indices this Sheriff may guard now (canGuard, slice 4 AM-11): players' plots, never the Sheriff's own. Optional only for older fixtures. */
    guardable?: number[];
    /** Order ids this Sheriff may fine. */
    fineable: string[];
    /** The fine bases allowed. */
    steps: number[];
    /** The sabotage ban's multiplier in force now. */
    multiplier: number;
  } | null;
  /** This player's own overrule ballot: true yes, false no, null not cast (slice 5). Optional only for older fixtures. */
  overruleBallot?: boolean | null;
  /** Per target, whether this player may call an overrule now, or why not. Optional only for older fixtures. */
  canOverrule?: Record<OverruleTarget, true | OverruleWhy>;
}

/** The law ballot as every screen sees it: who has voted, never how; the totals only from the reveal. */
export interface CouncilView {
  stage: 'ballot' | 'reveal' | 'over';
  proposal: LawProposal;
  proposer: string;
  impact: Record<string, LawImpact>;
  voted: string[];
  done: string[];
  waitingFor: string[];
  /** Ms of the reveal shown, out of revealMs. */
  clockMs: number;
  revealMs: number;
  result: { passed: boolean; yes: number; no: number; tie: boolean } | null;
}

/** One office's result as far as the ceremony has shown it: the totals from its bars beat, the winner and how from its winner beat. */
export type OfficeReveal = Pick<OfficeResult, 'tallies'> & Partial<Pick<OfficeResult, 'winner' | 'how'>>;

/** The ceremony's one show clock, in game seconds, the same on every screen. */
export interface CeremonyView {
  seconds: number;
  /** The whole show, every office and the summary after the last. */
  total: number;
  /**
   * Per office the show has reached, the latest beat it has reached and when that beat began, in show seconds. An
   * office is absent until its title beat; nothing later than the show clock is sent.
   */
  reached: Partial<Record<Office, { beat: CeremonyBeat; at: number }>>;
}

/** This month's election as every screen sees it: who runs and who has voted, never for whom. */
export interface ElectionView {
  stage: Election['stage'];
  /** The show clock and how far each office has got; null outside the ceremony. */
  ceremony: CeremonyView | null;
  /** Per elected office; empty until the ballot opens: until then the candidacy is Politics'. */
  candidates: Partial<Record<Office, string[]>>;
  /** Each Governor candidate's tax promise, public like the candidacy. */
  promises: Record<string, TaxPromise>;
  /** Players with a ballot in, never for whom. */
  voted: string[];
  /** Players who are Done in announce or the ballot: they pressed Ready, or Cast my vote. Picking alone is not Done. */
  done: string[];
  /** Players announce or the ballot still waits for; empty from the ceremony on. */
  waitingFor: string[];
  /** Each office's result as far as the ceremony has reached it, every screen at the same beat. */
  result: Partial<Record<Office, OfficeReveal>>;
}

/** The colony's offices, tax and vote weights, public on every screen. */
export interface PoliticsView {
  governor: string | null;
  sheriff: string | null;
  /** The months the sitting officeholders serve, or null before anyone holds office. */
  term: [number, number] | null;
  /** The next election's month, or null when the game ends first. */
  next: number | null;
  /** The Land Baron, fixed when planning opened. */
  baron: string | null;
  /** The sales tax in whole percent: now, when the month's planning opened, and the range the Governor may set. */
  tax: { percent: number; start: number; low: number; high: number };
  /** The colony fund the offices are paid from. */
  fund: number;
  /** What each elected office is paid at upkeep, as far as the fund reaches. */
  pay: Partial<Record<Office, number>>;
  /** Every player's votes, part by part. */
  weights: { id: string; votes: number; parts: VoteWeight['parts'] }[];
  /** Who runs for each elected office in the next election, until its ballot opens. */
  candidates: Partial<Record<Office, string[]>>;
  /** Each Governor candidate's tax promise, public like the candidacy. */
  promises: Record<string, TaxPromise>;
  /** The sitting Governor's promise, held for the term; null when they were appointed or nobody holds office. */
  promise: TaxPromise | null;
  /** The sales tax in whole percent when the sitting Governor's term began, for judging lower and hold; null before anyone governs. */
  promiseFrom: number | null;
  /** This month's election, or null in a month without one. */
  election: ElectionView | null;
  /** The Governor's pending law proposal, public with what it would cost each player, until the next planning's ballot. */
  proposal?: { by: string; month: number; proposal: LawProposal; impact: Record<string, LawImpact> } | null;
  /** This month's law ballot; null in a month without one. */
  council?: CouncilView | null;
  /** The laws in force, each at its setting since the month it passed. */
  laws?: Partial<Record<LawId, { setting: number; since: number }>>;
  /** For each failed proposal (`kind:law`), the first month it may come back. */
  retry?: Record<string, number>;
  /** Every broken card of the game, newest first: public (partyTo). Optional only for older fixtures. */
  brokenDeals?: DealCard[];
  /** Per player, the public reasons their reputation moved (reputationReasons), for the chip's tap. Optional only for older fixtures. */
  reputationReasons?: Record<string, ({ kind: 'broken'; id: string } | { kind: 'unrest'; month: number } | { kind: 'caught'; month: number })[]>;
  /** Sabotage as every screen sees it (slice 4): public orders only; null with sabotage off. Optional only for older fixtures. */
  sabotage?: {
    terms: Record<SabotageTarget['kind'], { cost: number; success: number; detect: number }>;
    incidents: IncidentView[];
    /** bounty: credits the Sheriff gets from the fund for each culprit a guard or an investigation names (POLITICS.sheriff.bounty, slice 4 AM-11). Optional only for older fixtures. */
    sheriff: { guards: number; investigations: number; investigationsLeft: number; bounty?: number };
    /** The sitting Sheriff's record this term: culprits caught by a guard, investigations solved (slice 4 AM-11). Shown for the outgoing Sheriff on election day; where the guards stood is never sent. null with no Sheriff. Optional only for older fixtures. */
    sheriffRecord?: { caught: number; solved: number } | null;
  } | null;
  /** The colony budget (slice 5); null with politics off. Optional only for older fixtures. */
  budget?: BudgetView | null;
  /** This month's overrule or no-confidence vote, or null. Optional only for older fixtures. */
  overrule?: OverruleView | null;
  /** After RC: tax and budget overrules passed this term. */
  overruled?: number;
  /** After RC: the month of a snap election, or null. */
  snap?: number | null;
  /** After RC: this term's inquiry into the Governor, or null. */
  inquiry?: { record: InquiryRecord; finding: boolean } | null;
}

/** A player on the auction board. */
export interface WalkerView {
  id: string;
  /** Pass means off the board for this good. */
  side: AuctionSide;
  /** Their bid or ask, rounded. */
  price: number;
  /** Unrounded, for smooth drawing. */
  at: number;
  dir: -1 | 0 | 1;
  done: boolean;
  /** Their stock of the good up now, live as units trade; public like the status table. */
  units: number;
  /** The house line they stand at ('store' or 'ship'), or null. Standing there, they trade with it by themselves (RULE-1). */
  line?: string | null;
  /** A seller stopped at the amount they must hold (RULE-4): the phone says how to sell on. */
  held?: true;
}

/** Units changing hands right now: between two players, or with the store or the ship ('store', 'ship'). */
export interface DealView {
  buyer: string;
  seller: string;
  price: number;
  units: number;
}

/** The live goods auction, on every screen. */
export interface AuctionView {
  good: Good;
  /** The status screen, the walk, then the close stage: the board holds still while each phone shows its receipt (UX audit G-5). */
  stage: 'status' | 'walk' | 'close';
  /** Seconds left on the stage's clock. It runs slower while units change hands. */
  seconds: number;
  /** The stage's full time in seconds, for the draining time bar. */
  total: number;
  /** True while the clock is slowed by a trade. */
  slowed: boolean;
  /** Goods still to come after this one. */
  next: Good[];
  /** What the store pays, or null while it doesn't buy. */
  storeBuys: number | null;
  /**
   * The store's selling line: what it charges while it has units to sell. Once it is sold out (`storeForSale` 0), the
   * highest bid a buyer can pay, flagged by `storeSellsBid`, or its old price while no bid is above it; the store sells
   * nothing there. Null when it is sold out and the line is off.
   */
  storeSells: number | null;
  /** Present, as true, while `storeSells` is the highest bid on a sold-out store's line, not a price it sells at. */
  storeSellsBid?: true;
  /** The board's rest zones and hard edges, fixed as the good comes up: buyers rest below `buyersTop`, sellers above `sellersBottom`. */
  zones?: BoardZones;
  /** Units the store will sell of this good: its stock less the colonists' Food and Water reserve. */
  storeForSale: number;
  /** What the export ship pays for the next unit, while it is in port and wants this good. */
  shipPays: number | null;
  /** What it pays for each of the units it still wants, next first (it pays a little less for each). */
  shipQuote?: number[];
  /** The board's price range: it grows when a walker goes past it. */
  lo: number;
  hi: number;
  /** Walking speed in price units per second. */
  speed: number;
  walkers: WalkerView[];
  deals: DealView[];
  /** Units traded in this good so far. */
  units: number;
  /** The status screen: every player's had, used, made, now, need and spoilage of this good, as in the original. */
  status: StatusRow[];
  /** Goods skipped since the last one that came up, and why, for one line on screen. */
  skipped: { good: Good; reason: SkipReason }[];
  /** In the close stage: the good that comes up next, or null when this was the last. Null in the other stages. */
  upNext: Good | null;
  /** Only on a seat's own view, in the close stage: what it bought and sold of this good. Null on a board and in the other stages. */
  receipt: GoodReceipt | null;
  /**
   * At the first good's side pick, each Claude seat it waits for, with the server time (epoch ms) the wait ends. A seat
   * whose plan comes in time leaves the list; one whose wait ends without a plan stays with `builtin` for the rest of
   * that side pick. Absent when nobody is listed.
   */
  waitingForClaude?: { seatId: string; until: number; builtin?: true }[];
  /** Only on a seat's own view: its net credits from this month's auction so far. Null on a board. */
  tally: number | null;
}

/** What is for sale: a plot (with whatever stands on it), or the MULE off one of the seller's plots. */
export type LotItemView = { kind: 'plot'; x: number; y: number } | { kind: 'mule'; x: number; y: number; outfit: Outfit };

/** One listing, public from the moment it is made in planning. */
export interface ListingView {
  id: string;
  /** A player's id, or 'colony' for a plot the colony puts up. */
  seller: string;
  item: LotItemView;
  minimum: number;
  /** If nobody bids the minimum: the store buys it at `storePays`, or the seller keeps it. */
  unsold: 'store' | 'keep';
  storePays: number;
}

/** A buyer on a lot's board. Everyone but the seller, if they can pay the minimum (and, for a MULE, has no MULE in hand). */
export interface LotWalkerView extends Omit<WalkerView, 'units'> {
  /** Why a player stands aside, for the names along the bottom. */
  aside?: 'money' | 'mule';
}

export type LotResultView = { kind: 'sold'; buyer: string; price: number } | { kind: 'store'; price: number } | { kind: 'kept' };

/** The land auction while it runs: one lot at a time. */
export interface LandAuctionView {
  lot: ListingView;
  stage: 'intro' | 'walk' | 'result';
  seconds: number;
  total: number;
  /** This lot's place in the month's line-up, from 1. */
  number: number;
  count: number;
  lo: number;
  hi: number;
  speed: number;
  walkers: LotWalkerView[];
  /** The highest bid at or above the minimum, and who holds it: what wins at the bell. */
  leader: { id: string; bid: number } | null;
  result: LotResultView | null;
  next: ListingView[];
}

export interface MarketRow {
  good: Good;
  /** The price the store posted this month. */
  price: number;
  /** What the store pays, or null when it isn't buying. */
  storeBuys: number | null;
  /** What the store charges, or null when it is sold out. */
  storeSells: number | null;
  storeStock: number;
  /** Months of demand the colony's whole supply covers. */
  cover: number;
  /** Next month's expected demand. */
  demand: number;
  /** What the export ship pays for the next unit while in port, or null. */
  shipPays: number | null;
}

export interface ShipView {
  /** The month the ship calls. Its wishlist is public from the month before. */
  arrives: number;
  inPort: boolean;
  /** Goods it wants and how many units it still takes, once announced. */
  wants: Partial<Record<Good, number>> | null;
}

/** A player's own score, line by line, as only their phone receives it: `me.worthParts`, and their `scores` entry at game over. */
export type ScorePartsView = Omit<ScoreParts, 'total'>;

/** A reason a plot made more or less than its base, as a badge on the map: every one the engine names but the base and the events. */
export type ProductionReason = 'cluster' | 'species' | 'trait' | 'special' | 'pollution' | 'floor' | 'noEnergy' | 'energyOff' | 'noWater';

/** One working plot in the month's production show. Public, like the auction's status table. */
export interface ProductionLineView {
  x: number;
  y: number;
  owner: string;
  good: Good;
  /**
   * What the plot makes before any bonus or loss: its ground's yield, or a factory's run (ws6-ux AM-19). The server
   * always sets it; optional so screens and fixtures built before AM-19 still type.
   */
  base?: number;
  /** Units the plot made before the month's events: base plus every part. An event hit adds its delta on top. */
  made: number;
  /** Every reason its output moved from the base, in the engine's order; none is zero. */
  parts: { why: ProductionReason; delta: number }[];
}

/** Who has asked to speed the production show up (ws6-ux AM-19, B-AC-20). */
export interface ProductionHurryView {
  /** The people who tapped Speed up, in the order they did. An AI seat never asks: it counts as yes. */
  asked: string[];
  /** The show second (at full pace) from which the rest plays PRODUCTION_SHOW.fast times faster: null until every person asked. */
  from: number | null;
}

/** The colony's mood events C26's second engine PR adds (WS1's frozen contract): harmless once EventKey takes them. */
export type ColonyEventKey = 'storeStrike' | 'walkout' | 'loyalCrew' | 'riot' | 'volunteerCleanup';

/** What an event on screen is: one of the engine's month events, a colony mood event, or a player falling sick at development's start. */
export type ShowEventKey = EventKey | ColonyEventKey | 'sickness';

/** One event as every screen shows it, whichever phase fired it: production's map and every other phase's show. */
export interface EventView {
  key: ShowEventKey;
  kind: EventKind | 'sickness';
  title: string;
  line: string;
  sign: MonthEvent['sign'];
  scope: MonthEvent['scope'];
  /** Where it starts: a colony sweep's edge point, otherwise its first plot or its source. */
  origin: { x: number; y: number };
  /** For a colony sweep, the map edge it blows in from. */
  from?: 'n' | 'e' | 's' | 'w';
  /** Whose event it is: a personal event's player, or the player who fell sick. */
  player?: string;
  /** The plots it hit, in the order it reached them, and how many units each gained or lost. */
  hits: {
    x: number;
    y: number;
    order: number;
    delta: number;
    /** The special field the plot had until this hit, when the hit removes it: the map keeps its badge until the hit lands. */
    was?: SpecialField['kind'];
    /** What the plot is after this hit, when the hit changes what it is: 'plain' (its special field is gone), 'crater', 'idle'. */
    becomes?: 'plain' | 'crater' | 'idle';
    /** True when the hit destroyed or took the plot's MULE. */
    muleLost?: true;
    /** With muleLost: the good that MULE made. The view's tile has lost it already, so this is the only place it is named. */
    good?: Good;
  }[];
  /** What it changed off the map, in the order it changed it: a player's (by id), the store's or the colony's. */
  effects?: EventEffect[];
  /** The colony's objects it damaged (a riot). */
  objects?: { id: PrestigeId; becomes: 'damaged' }[];
  /** The phase whose show plays it. */
  phase: Phase;
  /** How big its story is on the TV. */
  weight: EventWeight;
  /** How long the show plays it, in ms at full pace; the client never computes this itself. */
  playMs: number;
  /** A sabotage order's effect (slice 4), as MonthEvent.sabotage. */
  sabotage?: { order: string; culprit: string | null; worked: boolean; guarded: boolean };
}

/** Production's name for EventView, from before every phase had a show. */
export type ProductionEventView = EventView;

/** When the current phase's event show plays (RULE-1): its intro, then each event's playMs in fired order. */
export interface EventShowView {
  /** Epoch ms on the server's clock when the intro starts: in production, where its map plays it; otherwise as the phase opens. */
  startsAt: number;
  /** The whole show, intro included, in ms at full pace like playMs: never more than the cap. */
  showMs: number;
  /** How long the intro plays before the first event, in ms at full pace. */
  introMs: number;
  /** Epoch ms on the server's clock when the show ends: startsAt plus showMs at the table's pace. */
  endsAt: number;
  /** Whether the server holds the phase's clocks until endsAt: then nobody can act and the show covers the screen. */
  held: boolean;
}

/** What every plot made this month and what the month's event did: never anything a player holds. */
export interface ProductionView {
  /** In reading order: row by row, left to right. */
  lines: ProductionLineView[];
  events: EventView[];
  /** How long the production phase was scheduled to run, in ms; the show's timeline stretches over it. */
  lengthMs: number;
  /** How long the phase's intro plays before the first event, in ms: 0 in a quiet month. */
  introMs: number;
  /** Who has asked to speed it up, during production; null in upkeep. The server always sets it; optional as `base` is. */
  hurry?: ProductionHurryView | null;
}

/**
 * The colonists' meal at a month end (needs C6): how many colonists ate, before the month changed their number, and of
 * Food and of Water what they took of their need, in whole units as the month-end line shows them.
 */
export interface ColonistMealView {
  colonists: number;
  food: { took: number; need: number };
  water: { took: number; need: number };
}

/** One screen's view of the game: a player's private view, or the public one for a board. */
export interface MuleView {
  finished: boolean;
  month: number;
  maxMonths: number;
  phase: Phase;
  /** Epoch ms when the current phase ends, or null if it waits for players. */
  phaseEndsAt: number | null;
  width: number;
  height: number;
  tiles: TileView[];
  /** The plot lit in the land grant right now. */
  lit: { x: number; y: number } | null;
  players: PlayerView[];
  me: MyView | null;
  market: MarketRow[];
  storeMules: number;
  mulePrice: number;
  colonists: number;
  /** Colony air gauge 0 to 100 and its band. */
  air: { level: number; band: 'clean' | 'smoggy' | 'toxic' | 'collapse' };
  /** The air at last month's end (upkeep), level and band as `air` showed them then; null in month 1. */
  lastAir: MuleView['air'] | null;
  /**
   * At the month end (upkeep, and game over after the last): true when that upkeep fed the colonists, false when the
   * store ran out of their Food or Water (the engine's colonistsHungry). Null otherwise.
   */
  colonistsFed: boolean | null;
  /**
   * At the month end, as colonistsFed: how many colonists ate and, of Food and of Water, what they took of their need
   * (needs C6). Whole units as the line shows them: need rounded up; took equal to it when they got it all, else
   * rounded down. Null outside the month end or when the report has no meal; absent from an older server.
   */
  colonistMeal?: ColonistMealView | null;
  ship: ShipView;
  /** The colony fund and the sales tax rate. */
  treasury: { money: number; salesTax: number };
  news: string[];
  /** The same lines as `news`, in the same order, each with the seats it names in the words' order, so a screen can mark a computer seat. Optional only for older fixtures. */
  newsLines?: NewsLine[];
  /** At game over; `parts` only on the viewer's own entry, never in the board view (goods are private). */
  scores: { id: string; score: number; parts?: ScorePartsView }[] | null;
  /** The live goods auction while it runs. */
  auction: AuctionView | null;
  /** This month's lots for the land auction, in line-up order. */
  listings: ListingView[];
  /** The month's lot slots: LOTS.maxLotsPerMonth, and how many are taken. */
  lotSlots: { used: number; max: number };
  /** The live land auction while it runs. */
  landAuction: LandAuctionView | null;
  /** The month's production show, during production and upkeep. */
  production: ProductionView | null;
  /** The events the current phase fired, in fired order; empty when it fired none. Optional only for older fixtures: the server always sends it. */
  events?: EventView[];
  /** When those events play; null when there are none. Optional only for older fixtures: the server always sends it. */
  eventShow?: EventShowView | null;
  /** Offices, tax, vote weights and the election; null when the game plays without politics. */
  politics: PoliticsView | null;
  /** The colony as a shared project: gauges, fund, prestige objects and plaques; null when the game plays without politics. Every screen gets the same. */
  colony?: ColonyView | null;
}

export const PLAYER_COLORS = ['#e4572e', '#3a86ff', '#2bb673', '#f2a541', '#9b5de5', '#00b4d8'];

/** The colony's four gauges; happiness and its band are null until the colony has a mood. */
export interface ColonyGaugesView {
  wealth: number;
  /** The air gauge: the colony's pollution, 0 clean. */
  environment: number;
  prestige: number;
  happiness: number | null;
  band: 'thriving' | 'content' | 'restless' | 'unhappy' | 'unrest' | null;
}

export interface ColonyProjectView {
  id: PrestigeId;
  name: string;
  stage: 'commissioned' | 'building' | 'standing' | 'closed' | 'damaged';
  cost: { credits: number; goods: Partial<Record<Good, number>> };
  funded: { credits: number; goods: Partial<Record<Good, number>> };
  buildMonths: number;
  /** Upkeeps left until it stands; null unless building. */
  monthsLeft: number | null;
  /**
   * Its block on the colony's own grounds, in cells: the top-left cell (x right, y down, the town hall on the centre
   * cell) and its footprint, w × h; null holds none (G-5 RULE-32b).
   */
  place: { x: number; y: number; w: number; h: number } | null;
  prestige: number;
  /** Credits a month while it stands. */
  upkeep: number;
  /** Credits to repair it; null unless damaged. */
  repairCost: number | null;
  /** Donors, largest first: credits plus goods at reference price. */
  plaque: { playerId: string; value: number }[];
}

/** One object the Governor could commission, and why not when they can't now. */
export interface ColonyCatalogueView {
  id: PrestigeId;
  name: string;
  credits: number;
  goods: Partial<Record<Good, number>>;
  buildMonths: number;
  prestige: number;
  upkeep: number;
  commissionable: boolean;
  why: string | null;
}

/** The colony as every screen sees it. Public: no ballot and no private hand reaches it. */
export interface ColonyView {
  gauges: ColonyGaugesView;
  /** Last month's gauges, for "this month"'s change; null in month 1. */
  lastGauges: { wealth: number; prestige: number; happiness: number | null } | null;
  fund: number;
  /** The ledger of the month just ended, or this month's once its upkeep has run; null before the first upkeep. */
  ledger: { month: number; in: Partial<Record<FundSource, number>>; out: Partial<Record<FundLine, number>> } | null;
  projects: ColonyProjectView[];
  catalogue: ColonyCatalogueView[];
  /** What a unit of each good the catalogue needs adds to a donor's plaque: the price the engine values a gift at. Optional, so views built before it still type. */
  refPrice?: Partial<Record<Good, number>>;
  /** This month's general strike: the good it holds back, what the strikers want, and whether the fund paid; null when none. Optional, so views built before W3 still type. */
  strike?: { good: Good; cost: number; paid: boolean } | null;
  /** The colony score every month, as the state stands (G-5 RULE-25, AM-12: wealth, environment and prestige in credits, the happiness factor, the rounded total). */
  score: { wealth: number; environment: number; prestige: number; factor: number; total: number } | null;
  /** The colony score's total as the last month ended, for "+N since last month"; null in month 1 or before the colony has a mood (AM-12). */
  lastScore?: number | null;
  /** This month's Welfare payment (slice 5), or null. Optional, so views built before it still type. */
  welfare?: { month: number; to: string; paid: number } | null;
}
