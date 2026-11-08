import {
  budgetCredits,
  canRun,
  commissionRefusal,
  createRng,
  lawOffered,
  moodBand,
  nextElectionMonth,
  observe,
  PERCENT,
  plotsOwned,
  POLITICS,
  PRESTIGE,
  score,
  taxBounds,
  type AiPersonaId,
  type Council,
  type DealCard,
  type Election,
  type GameState,
  type Good,
  type LawId,
  type LawProposal,
  type Office,
  type PlayerId,
  type PrestigeId,
  type Rng,
  type TaxPromise,
  votesOpen,
} from '@mule/engine';
import type { Act } from '../actions.js';
import { breakGain, lawWorth, reputationCost } from '../politics-value.js';
import type { Mind } from '../value.js';
import { BudgetHand, OverruleHand } from './budget.js';
import { SabotageHand } from './sabotage.js';
import { SheriffHand } from './sheriff.js';

function samePromise(a: TaxPromise | undefined, b: TaxPromise): boolean {
  return a?.kind === b.kind && (a.kind !== 'cap' || (b.kind === 'cap' && a.percent === b.percent));
}

/**
 * The Governor's next rate: a step toward the target of at most maxStep, a bump when the fund is low, inside the bounds.
 * The fund starts empty, so it counts as low only from month 2, after the offices' first payday. See WS7 spec RULE-8, AM-9.
 */
export function nextTax(current: number, target: number, fund: number, bounds: { low: number; high: number }, month: number): number {
  const { maxStep } = POLITICS.tax;
  const { taxFundBump, fundMonths } = POLITICS.ai;
  const step = Math.max(-maxStep, Math.min(maxStep, target - current));
  const officesPay = POLITICS.offices.reduce((sum, office) => sum + POLITICS.pay[office], 0);
  const fundLow = month > 1 && fund < fundMonths * officesPay;
  return Math.max(bounds.low, Math.min(bounds.high, current + step + (fundLow ? taxFundBump : 0)));
}

/**
 * Whether every good an object needs is within the colony's reach, as the seat sees it (PM ruling, 6 Nov): the players'
 * stock, the store's stock and the units the players made last month together cover the object's need of that good.
 * The seat reads observe(): other players' stock is what the market panel implies, and only its own row of last
 * month's production shows.
 */
export function goodsInReach(obs: GameState, id: PrestigeId): boolean {
  const lastMonth = obs.history.at(-1)?.produced ?? {};
  return (Object.entries(PRESTIGE[id].goods) as [Good, number][]).every(([good, need]) => {
    const held = obs.players.reduce((sum, p) => sum + p.stock[good], 0);
    const made = Object.values(lastMonth).reduce((sum, row) => sum + row[good], 0);
    return held + obs.store.stock[good] + made >= need;
  });
}

/** G-5 C25: in the bands POLITICS.ai.colony.leanIn it will not back the sitting Governor while anyone else runs. */
function leanAgainst(obs: GameState, candidates: readonly string[], office: Office): readonly string[] {
  const sitting = obs.politics!.governor;
  const unhappy = obs.colony !== null && POLITICS.ai.colony.leanIn.includes(moodBand(obs.colony.happiness));
  if (office !== 'governor' || !unhappy || sitting === null || !candidates.includes(sitting)) return candidates;
  const others = candidates.filter((id) => id !== sitting);
  return others.length > 0 ? others : candidates;
}

/** The candidates holding the fewest plots among those it may back; more than one is a tie. */
function fewestPlots(obs: GameState, pool: readonly string[]): string[] {
  const fewest = Math.min(...pool.map((id) => plotsOwned(obs, id)));
  return pool.filter((id) => plotsOwned(obs, id) === fewest);
}

/** An election ballot a seat is about to cast: the office and who stands for it. */
export interface ElectionBallot {
  office: Office;
  candidates: readonly string[];
}

/** A law ballot a seat is about to cast: the proposal on the table. */
export interface LawBallot {
  proposal: LawProposal;
}

export type Ballot = ElectionBallot | LawBallot;

/**
 * WS2's port to a Claude seat's recorded reasoning (slice 3 AM-5; WS2 Spec B v2 AM-B5). A null answer means the keyless
 * rule. It answers from recorded state only (WS2 HC-B3), so a replay casts the same vote, and it is never asked
 * for an office the seat itself runs for.
 */
export interface VotePort {
  electionVote(office: Office, candidates: readonly PlayerId[]): PlayerId | null;
  lawVote(proposal: LawProposal): boolean | null;
}

/**
 * The seat's own vote on a ballot, by today's rule and with no draw (slice 3 S3-C14). On an election: itself if it
 * runs (always, whatever card it holds; AM-8), else the port's answer when it gives one, else the candidate with the
 * fewest plots, leaning against an unloved Governor. On a law: yes for the sitting Governor, who is not asked the
 * port (AM-8); for every other seat the port's answer when it gives one, else RULE-46's rows.
 * Null where today's rule would draw: a tie, or a Rookie's guess. DealHand reads it to offer a vote, VoteHand to cast one.
 */
export function ownVote(obs: GameState, mind: Mind, ballot: ElectionBallot, port?: VotePort): string | null;
export function ownVote(obs: GameState, mind: Mind, ballot: LawBallot, port?: VotePort): boolean | null;
export function ownVote(obs: GameState, mind: Mind, ballot: Ballot, port?: VotePort): string | boolean | null {
  return 'proposal' in ballot ? ownLawVote(obs, mind, ballot.proposal, port) : ownElectionVote(obs, mind, ballot, port);
}

function ownElectionVote(obs: GameState, mind: Mind, { office, candidates }: ElectionBallot, port?: VotePort): string | null {
  if (candidates.includes(mind.me)) return mind.me;
  const asked = port?.electionVote(office, candidates);
  if (asked != null && candidates.includes(asked)) return asked;
  if (mind.levelId === 'rookie') return null;
  const tied = fewestPlots(obs, leanAgainst(obs, candidates, office));
  return tied.length === 1 ? tied[0]! : null;
}

/** The Governor's yes, else the port's yes or no, else RULE-46's vote rows (AM-8). */
function ownLawVote(obs: GameState, mind: Mind, proposal: LawProposal, port?: VotePort): boolean | null {
  const me = mind.me;
  const politics = obs.politics!;
  if (politics.governor === me) return true;
  const asked = port?.lawVote(proposal);
  if (typeof asked === 'boolean') return asked;
  if (proposal.kind === 'enact' && proposal.law === 'landTax' && politics.baron === me) return false;
  if (mind.levelId === 'rookie') return null;
  // S4-RULE-13, AM-6: the ban's vote is its worth to the seat; a tie goes to the ban (an enact passes on >= 0, a repeal only on > 0).
  if (proposal.law === 'sabotageBan') return proposal.kind === 'enact' ? lawWorth(obs, me, proposal) >= 0 : lawWorth(obs, me, proposal) > 0;
  // A law's worth is minus its cost (an enact) or its cost saved (a repeal): the cost rows of RULE-46 read the other way up.
  const worths = obs.players.map((p) => lawWorth(obs, p.id, proposal)).sort((a, b) => a - b);
  const half = Math.floor(worths.length / 2); // literal-ok: the middle of a list
  const median = worths.length % 2 === 1 ? worths[half]! : (worths[half - 1]! + worths[half]!) / 2; // literal-ok: odd or even count
  const mine = lawWorth(obs, me, proposal);
  return proposal.kind === 'enact' ? mine >= median : mine > median;
}

/**
 * The politics hand of a Classic seat: runs for office, votes and, as
 * Governor, sets the tax (WS7 spec RULE-8, RULE-63). It decides its candidacy
 * once per election cycle, ahead of the election, or at month 1's last call,
 * the only announce that takes a run. In announce and the ballot it acts once
 * after a seeded pause and presses Done, its Cast in the ballot; elsewhere in
 * planning it acts at once. A refused move is not retried. It times itself on
 * the public phase, month and stage, and decides from observe().
 */
export class VoteHand {
  /** month:stage of the stage it last saw. */
  private key = '';
  private waitMs = 0;
  private acted = false;
  /** The election month it last decided its candidacy for. */
  private decidedFor: number | null = null;
  /** Slice 4's hands (S4-C10): each draws from its own seat-salted stream, never from this hand's rng. */
  private readonly sabotage: SabotageHand;
  private readonly sheriff: SheriffHand;
  /** Slice 5's hands (S5-C6). */
  private readonly budget: BudgetHand;
  private readonly overrule: OverruleHand;
  /** The term (its termStart) in which this seat, as Governor, saw a tax overrule pass against it: it holds its tax and budget till the term ends. */
  private overruledTerm: number | null = null;

  constructor(
    readonly mind: Mind,
    private readonly rng: Rng,
    private readonly port?: VotePort,
  ) {
    this.sabotage = new SabotageHand(mind);
    this.sheriff = new SheriffHand(mind);
    this.budget = new BudgetHand(mind);
    this.overrule = new OverruleHand(mind);
  }

  /** Call before stepElection, with the same (phaseScale-divided) dt. */
  tick(state: GameState, dt: number, act: Act): void {
    if (state.phase !== 'planning' || !state.politics) return;
    // The law ballot, once the election is over: it votes per RULE-46 and presses Done at once. Its draws come from
    // the council's own stream, so the election's seeded stream stays as it was (HC-41) and no ballot waits on an AI seat.
    const { council, election, overrule } = state.politics;
    this.noteOverrule(state);
    // The overrule ballot opens as planning ends: one vote and Done, from the overrule's own stream (S5-RULE-12, D-S5-2).
    if (overrule?.stage === 'ballot') {
      if (!overrule.done.includes(this.mind.me)) this.overrule.vote(observe(state, this.mind.me), act);
      return;
    }
    if (overrule?.stage === 'reveal') return;
    if (council?.stage === 'ballot' && (!election || election.stage === 'over')) {
      if (!council.done.includes(this.mind.me)) {
        if (council.ballots[this.mind.me] === undefined) act({ type: 'voteLaw', yes: this.lawVote(observe(state, this.mind.me), council) });
        act({ type: 'done', done: true });
      }
      return;
    }
    // A tax that moved is judged once per setting, on every tick with no vote open (S5-RULE-12).
    if (!votesOpen(state) && (election?.stage ?? 'over') === 'over' && this.overrule.due(state)) this.overrule.call(observe(state, this.mind.me), act);
    // The reveal: votes are still open, so the Governor waits it out rather than spend its month's turn on refusals.
    if (council?.stage === 'reveal') return;
    const stage: Election['stage'] | 'none' = state.politics.election?.stage ?? 'none';
    const key = `${state.month}:${stage}`;
    if (key !== this.key) {
      this.key = key;
      this.acted = false;
      this.waitMs = stage === 'announce' || stage === 'ballot' ? this.rng.int(...POLITICS.ai.actMs) : 0;
    }
    if (this.acted || stage === 'ceremony') return;
    this.waitMs -= dt;
    if (this.waitMs > 0) return;
    this.acted = true;

    const obs = observe(state, this.mind.me);
    if (stage === 'over' || stage === 'none') {
      this.govern(obs, act, () => observe(state, this.mind.me));
      this.sabotage.order(obs, act);
      this.sheriff.run(obs, act, () => observe(state, this.mind.me));
      this.declareAhead(obs, act);
      return;
    }
    // Only month 1's announce takes a run; a later one closed the field as the month opened, so the seat only waits.
    if (stage === 'announce') {
      if (canRun(obs, this.mind.me).governor !== 'closed') this.lastCall(obs, act);
    } else this.vote(obs, obs.politics!.election!, act);
    act({ type: 'done', done: true });
  }

  private get persona(): AiPersonaId {
    return this.mind.personaId as AiPersonaId;
  }

  /** RULE-63 row 1: in the first planning phase within declareLeadMonths of the next election. */
  private declareAhead(obs: GameState, act: Act): void {
    const next = nextElectionMonth(obs);
    if (next === null || next - obs.month > POLITICS.ai.declareLeadMonths || this.decidedFor === next) return;
    this.decide(obs, next, act);
  }

  /** RULE-63 rows 2 and 3, month 1's announce: decide now if it has not, else refresh a Governor promise against the tax now. */
  private lastCall(obs: GameState, act: Act): void {
    if (this.decidedFor !== obs.month) return this.decide(obs, obs.month, act);
    const politics = obs.politics!;
    if (!politics.candidates.governor.includes(this.mind.me)) return;
    const promise = this.promise(obs);
    if (!samePromise(politics.promises[this.mind.me], promise)) act({ type: 'run', office: 'governor', promise });
  }

  private decide(obs: GameState, electionMonth: number, act: Act): void {
    this.decidedFor = electionMonth;
    const may = canRun(obs, this.mind.me);
    const { runGovernor, runSheriff } = POLITICS.ai;
    if (may.governor === true && this.rng.chance(runGovernor[this.persona])) act({ type: 'run', office: 'governor', promise: this.promise(obs) });
    else if (may.sheriff === true && this.rng.chance(runSheriff[this.persona])) act({ type: 'run', office: 'sheriff' });
  }

  /** RULE-10's AI row: the persona's target against the tax now, with no draw, so the seeded stream is unchanged. */
  private promise(obs: GameState): TaxPromise {
    const target = POLITICS.ai.taxTarget[this.persona];
    const current = Math.round(obs.treasury.salesTax * PERCENT);
    if (target > current) return { kind: 'cap', percent: target };
    return target < current ? { kind: 'lower' } : { kind: 'hold' };
  }

  private vote(obs: GameState, election: Readonly<Election>, act: Act): void {
    for (const office of POLITICS.offices) {
      const candidates = election.candidates[office];
      // literal-ok: an office is contested only with two or more candidates, a definition
      if (candidates.length < 2) continue;
      const own = this.choose(obs, candidates, office);
      // A candidate votes itself (AM-8), so a card for a rival on that office breaks.
      const card = candidates.includes(this.mind.me) ? undefined : this.activeCard(obs, (t) => 'office' in t && t.office === office && candidates.includes(t.candidate));
      act({ type: 'vote', office, candidate: this.keepOrBreak(obs, card, own, card && 'office' in card.terms ? card.terms.candidate : own) });
    }
  }

  /**
   * ownVote, and where that is null, the draw: a Rookie's seeded guess, or a tie broken among the tied, not by seat
   * (AM-10: in month 1 nobody owns land). A lone minimum draws nothing.
   */
  private choose(obs: GameState, candidates: readonly string[], office: Office): string {
    const own = ownVote(obs, this.mind, { office, candidates }, this.port);
    if (own !== null) return own;
    const pool = leanAgainst(obs, candidates, office);
    return this.rng.pick(this.mind.levelId === 'rookie' ? pool : fewestPlots(obs, pool));
  }

  /** The active vote card this seat gave whose terms the ballot takes, if any; the first when it gave several. */
  private activeCard(obs: GameState, takes: (terms: Extract<DealCard['terms'], { kind: 'vote' }>) => boolean): DealCard | undefined {
    return obs.politics!.deals.find((d) => d.status === 'active' && d.from === this.mind.me && d.terms.kind === 'vote' && takes(d.terms));
  }

  /**
   * S3-RULE-10: with a card on the ballot, its own vote when that is the promised choice or when breaking pays
   * (breakGain above the persona's honesty times what the broken vote costs its reputation); a Rookie always keeps.
   * Nothing draws: `own` has already been chosen as today.
   */
  private keepOrBreak<T extends string | boolean>(obs: GameState, card: DealCard | undefined, own: T, promised: T): T {
    if (!card || own === promised) return own;
    if (this.mind.levelId === 'rookie') return promised;
    const costOfBreaking = POLITICS.ai.deals.honesty[this.persona] * reputationCost(obs, this.mind.me, POLITICS.reputation.moves.voteBroken);
    return breakGain(obs, this.mind.me, card) > costOfBreaking ? own : promised;
  }

  /**
   * The council's own draws for this seat and month (slice 2a HC-41): the election's stream never moves for it. It
   * hashes the seat's own seed (the mind's salt), never the game's: that one drives the game's dice, which observe() hides.
   */
  private council(obs: GameState): Rng {
    // Every seat's mind carries its own salt (AiSeat); without one, seats would share a coin (INV-41).
    if (this.mind.salt === undefined) throw new Error("A VoteHand's mind needs the seat's salt: build it with AiSeat");
    const seatSeed = this.mind.salt ^ 0x2545f491; // literal-ok: a hash salt, so the council's stream is its own
    return createRng((Math.imul(seatSeed, 1_000_003) ^ Math.imul(obs.month, 7_919)) >>> 0); // literal-ok: hashing constants (primes) that make one stream per seat and month
  }

  /** RULE-46's vote rows through ownVote; a Rookie's yes is the council's own draw. */
  private lawVote(obs: GameState, council: Readonly<Council>): boolean {
    const own = ownVote(obs, this.mind, { proposal: council.proposal }, this.port) ?? this.council(obs).chance(POLITICS.ai.council.rookieYes);
    const card = this.activeCard(obs, (t) => 'law' in t);
    return this.keepOrBreak(obs, card, own, card && 'yes' in card.terms ? card.terms.yes : own);
  }

  /** RULE-46's proposal: the law that costs the leader most against itself, put at its middle setting, or a repeal. */
  private proposeLaw(obs: GameState, act: Act): void {
    const me = this.mind.me;
    const politics = obs.politics!;
    if (politics.proposal) return;
    const others = obs.players.filter((p) => p.id !== me);
    if (others.length === 0) return;
    const leader = others.reduce((best, p) => (score(obs, p.id) > score(obs, best.id) ? p : best)).id;
    const { minGap, proposeChance } = POLITICS.ai.council;
    const { retryMonths, maxInForce } = POLITICS.council;
    const waiting = (proposal: LawProposal) => {
      const failedIn = politics.failed[`${proposal.kind}:${proposal.law}`];
      return failedIn !== undefined && obs.month <= failedIn + retryMonths;
    };
    const candidates: { proposal: LawProposal; gain: number }[] = [];
    for (const law of (Object.keys(POLITICS.laws) as LawId[]).filter(lawOffered)) {
      const inForce = politics.laws[law];
      const { settings } = POLITICS.laws[law];
      const proposal: LawProposal = inForce
        ? { kind: 'repeal', law }
        : { kind: 'enact', law, setting: settings[Math.floor(settings.length / 2)]! }; // literal-ok: the middle setting
      if (waiting(proposal)) continue;
      const [self, lead] = [lawWorth(obs, me, proposal), lawWorth(obs, leader, proposal)];
      candidates.push({ proposal, gain: self - lead });
    }
    const best = candidates.reduce<{ proposal: LawProposal; gain: number } | null>((b, c) => (b === null || c.gain > b.gain ? c : b), null);
    if (!best || best.gain < minGap || !this.council(obs).chance(proposeChance[this.persona])) return;
    let proposal = best.proposal;
    if (proposal.kind === 'enact' && Object.keys(politics.laws).length >= maxInForce) {
      const inForce = Object.keys(politics.laws) as LawId[];
      const dearest = inForce.reduce((a, b) => (lawWorth(obs, me, { kind: 'repeal', law: b }) > lawWorth(obs, me, { kind: 'repeal', law: a }) ? b : a));
      proposal = { ...proposal, replaces: dearest };
    }
    act({ type: 'propose', proposal });
  }

  /**
   * G-5 C25 (AM-10): the AI Governor pays the strike, mends what is damaged, the most prestige first, then commissions
   * an object whose goods are within reach (goodsInReach) and whose credits the fund holds
   * POLITICS.ai.colony.commissionShare of (pace set C), the most prestige among those. It builds on the colony's own
   * grounds once funded (C48). None in reach, it commissions nothing.
   */
  private colonyActs(obs: GameState, act: Act): void {
    const colony = obs.colony;
    if (!colony) return;
    const { commissions, commissionShare, paysStrike, repairs } = POLITICS.ai.colony;
    const strike = colony.strike;
    let fund = obs.treasury.money;
    if (strike && strike.month === obs.month && !strike.paid && paysStrike[this.persona] && fund >= strike.cost && act({ type: 'payStrike' })) fund -= strike.cost;
    if (repairs[this.persona]) {
      const damaged = colony.projects.filter((p) => p.stage === 'damaged').sort((a, b) => PRESTIGE[b.id].prestige - PRESTIGE[a.id].prestige);
      for (const { id } of damaged) if (PRESTIGE[id].repairCost <= fund && act({ type: 'repair', id })) fund -= PRESTIGE[id].repairCost;
    }
    if (!commissions[this.persona]) return;
    // S5-RULE-13: with a budget set, only the Projects share's credits are all that upkeep will give to buildings.
    const room = obs.politics!.budget === null ? fund : Math.min(fund, budgetCredits(obs).projects);
    const choices = (Object.keys(PRESTIGE) as PrestigeId[])
      .filter((id) => PRESTIGE[id].credits * commissionShare <= room && goodsInReach(obs, id) && commissionRefusal(obs, id) === null)
      .sort((a, b) => PRESTIGE[b].prestige - PRESTIGE[a].prestige || PRESTIGE[a].credits - PRESTIGE[b].credits);
    const pick = choices[0];
    if (pick) act({ type: 'commission', id: pick });
  }

  /** Remembers a tax overrule that passed against this seat as Governor: the engine's per-month record is gone by next month. */
  private noteOverrule(state: GameState): void {
    const { overrule, governor, termStart } = state.politics!;
    if (governor === this.mind.me && overrule?.target === 'tax' && overrule.result?.passed) this.overruledTerm = termStart;
  }

  /** S5-RULE-11, S5-RULE-13: after an overrule passed against it this term, the Governor holds its tax and its budget. */
  private holding(obs: GameState): boolean {
    return obs.politics!.overruled > 0 || this.overruledTerm === obs.politics!.termStart;
  }

  private govern(obs: GameState, act: Act, look: () => GameState): void {
    if (obs.politics!.governor !== this.mind.me) return;
    let seen = obs;
    if (!this.holding(obs)) {
      const current = Math.round(obs.treasury.salesTax * PERCENT);
      const next = nextTax(current, POLITICS.ai.taxTarget[this.persona], obs.treasury.money, taxBounds(obs), obs.month);
      if (next !== current) act({ type: 'setTax', percent: next });
      // The colony acts below read the budget just set, so they see a fresh copy; none sent, the same obs.
      if (this.budget.split(obs, act)) seen = look();
    }
    this.proposeLaw(obs, act);
    this.colonyActs(seen, act);
  }
}
