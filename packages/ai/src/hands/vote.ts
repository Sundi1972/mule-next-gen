import {
  canRun,
  commissionRefusal,
  createRng,
  lawImpact,
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
  type Election,
  type GameState,
  type LawId,
  type LawProposal,
  type Office,
  type PrestigeId,
  type Rng,
  type TaxPromise,
} from '@mule/engine';
import type { Act } from '../actions.js';
import type { Mind } from '../value.js';

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

  constructor(
    readonly mind: Mind,
    private readonly rng: Rng,
  ) {}

  /** Call before stepElection, with the same (phaseScale-divided) dt. */
  tick(state: GameState, dt: number, act: Act): void {
    if (state.phase !== 'planning' || !state.politics) return;
    // The law ballot, once the election is over: it votes per RULE-46 and presses Done at once. Its draws come from
    // the council's own stream, so the election's seeded stream stays as it was (HC-41) and no ballot waits on an AI seat.
    const { council, election } = state.politics;
    if (council?.stage === 'ballot' && (!election || election.stage === 'over')) {
      if (!council.done.includes(this.mind.me)) {
        if (council.ballots[this.mind.me] === undefined) act({ type: 'voteLaw', yes: this.lawVote(observe(state, this.mind.me), council) });
        act({ type: 'done', done: true });
      }
      return;
    }
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
      this.govern(obs, act);
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
      act({ type: 'vote', office, candidate: this.choose(obs, candidates, office) });
    }
  }

  /**
   * Itself if it runs; a Rookie's seeded guess; else the smallest landowner, so the table leans against the leader.
   * A tie is a seeded draw, not the lower seat: in month 1 nobody owns land (AM-10). A lone minimum draws nothing.
   */
  private choose(obs: GameState, candidates: readonly string[], office: Office): string {
    if (candidates.includes(this.mind.me)) return this.mind.me;
    const pool = this.leanAgainst(obs, candidates, office);
    if (this.mind.levelId === 'rookie') return this.rng.pick(pool);
    const fewest = Math.min(...pool.map((id) => plotsOwned(obs, id)));
    const tied = pool.filter((id) => plotsOwned(obs, id) === fewest);
    return tied.length === 1 ? tied[0]! : this.rng.pick(tied);
  }

  /** G-5 C25: below POLITICS.ai.colony.leanBelow it will not back the sitting Governor while anyone else runs. */
  private leanAgainst(obs: GameState, candidates: readonly string[], office: Office): readonly string[] {
    const sitting = obs.politics!.governor;
    const unhappy = obs.colony !== null && obs.colony.happiness < POLITICS.ai.colony.leanBelow;
    if (office !== 'governor' || !unhappy || sitting === null || !candidates.includes(sitting)) return candidates;
    const others = candidates.filter((id) => id !== sitting);
    return others.length > 0 ? others : candidates;
  }

  /** The council's own draws for this game, month and seat (slice 2a HC-41): the election's stream never moves for it. */
  private council(obs: GameState): Rng {
    const seat = obs.players.findIndex((p) => p.id === this.mind.me);
    return createRng(((obs.seed * 1_000_003) ^ (obs.month * 7_919) ^ (seat * 104_729)) >>> 0); // literal-ok: hashing constants (primes) that make one stream per game, month and seat
  }

  /** What a law costs a player a month: an enact at its setting, a repeal at the setting in force (slice 2a RULE-45). */
  private lawCost(obs: GameState, proposal: LawProposal, playerId: string): number {
    const setting = proposal.kind === 'enact' ? proposal.setting : obs.politics!.laws[proposal.law]?.setting;
    if (setting === undefined) return 0;
    return lawImpact(obs, { kind: 'enact', law: proposal.law, setting })[playerId]?.cost ?? 0;
  }

  /** RULE-46's vote rows. */
  private lawVote(obs: GameState, council: Readonly<Council>): boolean {
    const me = this.mind.me;
    const { proposal } = council;
    const politics = obs.politics!;
    if (politics.governor === me) return true;
    if (proposal.kind === 'enact' && proposal.law === 'landTax' && politics.baron === me) return false;
    if (this.mind.levelId === 'rookie') return this.council(obs).chance(POLITICS.ai.council.rookieYes);
    const costs = obs.players.map((p) => this.lawCost(obs, proposal, p.id)).sort((a, b) => a - b);
    const half = Math.floor(costs.length / 2); // literal-ok: the middle of a list
    const median = costs.length % 2 === 1 ? costs[half]! : (costs[half - 1]! + costs[half]!) / 2; // literal-ok: odd or even count
    const mine = this.lawCost(obs, proposal, me);
    return proposal.kind === 'enact' ? mine <= median : mine > median;
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
    for (const law of Object.keys(POLITICS.laws) as LawId[]) {
      const inForce = politics.laws[law];
      const { settings } = POLITICS.laws[law];
      const proposal: LawProposal = inForce
        ? { kind: 'repeal', law }
        : { kind: 'enact', law, setting: settings[Math.floor(settings.length / 2)]! }; // literal-ok: the middle setting
      if (waiting(proposal)) continue;
      const [self, lead] = [this.lawCost(obs, proposal, me), this.lawCost(obs, proposal, leader)];
      candidates.push({ proposal, gain: inForce ? self - lead : lead - self });
    }
    const best = candidates.reduce<{ proposal: LawProposal; gain: number } | null>((b, c) => (b === null || c.gain > b.gain ? c : b), null);
    if (!best || best.gain < minGap || !this.council(obs).chance(proposeChance[this.persona])) return;
    let proposal = best.proposal;
    if (proposal.kind === 'enact' && Object.keys(politics.laws).length >= maxInForce) {
      const inForce = Object.keys(politics.laws) as LawId[];
      const dearest = inForce.reduce((a, b) => (this.lawCost(obs, { kind: 'repeal', law: b }, me) > this.lawCost(obs, { kind: 'repeal', law: a }, me) ? b : a));
      proposal = { ...proposal, replaces: dearest };
    }
    act({ type: 'propose', proposal });
  }

  /** G-5 C25: an AI Governor pays a strike it can afford and commissions the most prestige the fund can pay for, by persona. */
  private colonyActs(obs: GameState, act: Act): void {
    const colony = obs.colony;
    if (!colony) return;
    const { commissions, paysStrike } = POLITICS.ai.colony;
    const strike = colony.strike;
    if (strike && strike.month === obs.month && !strike.paid && paysStrike[this.persona] && obs.treasury.money >= strike.cost) act({ type: 'payStrike' });
    if (!commissions[this.persona]) return;
    // Plot-free objects only, until the AI Governor bids for a site (a later C25 step).
    const choices = (Object.keys(PRESTIGE) as PrestigeId[])
      .filter((id) => !PRESTIGE[id].needsPlot && PRESTIGE[id].credits <= obs.treasury.money && commissionRefusal(obs, id) === null)
      .sort((a, b) => PRESTIGE[b].prestige - PRESTIGE[a].prestige || PRESTIGE[a].credits - PRESTIGE[b].credits);
    if (choices[0]) act({ type: 'commission', id: choices[0] });
  }

  private govern(obs: GameState, act: Act): void {
    if (obs.politics!.governor !== this.mind.me) return;
    const current = Math.round(obs.treasury.salesTax * PERCENT);
    const next = nextTax(current, POLITICS.ai.taxTarget[this.persona], obs.treasury.money, taxBounds(obs), obs.month);
    if (next !== current) act({ type: 'setTax', percent: next });
    this.proposeLaw(obs, act);
    this.colonyActs(obs, act);
  }
}
