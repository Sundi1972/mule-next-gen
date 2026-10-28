import {
  canRun,
  nextElectionMonth,
  observe,
  PERCENT,
  plotsOwned,
  POLITICS,
  taxBounds,
  type AiPersonaId,
  type Election,
  type GameState,
  type Office,
  type Rng,
  type TaxPromise,
} from '@mule/engine';
import type { Act } from '../actions.js';
import type { Mind } from '../value.js';

/**
 * The Governor's next rate: a step toward the target of at most maxStep, a bump when the fund is low, inside the bounds.
 * The fund starts empty, so it counts as low only from month 2, after the offices' first payday. See WS7 spec RULE-8, AM-9.
 */
function samePromise(a: TaxPromise | undefined, b: TaxPromise): boolean {
  return a?.kind === b.kind && (a.kind !== 'cap' || (b.kind === 'cap' && a.percent === b.percent));
}

export function nextTax(current: number, target: number, fund: number, bounds: { low: number; high: number }, month: number): number {
  const { maxStep } = POLITICS.tax;
  const { taxFundBump, fundMonths } = POLITICS.ai;
  const step = Math.max(-maxStep, Math.min(maxStep, target - current));
  const fundLow = month > 1 && fund < fundMonths * (POLITICS.pay.governor + POLITICS.pay.sheriff);
  return Math.max(bounds.low, Math.min(bounds.high, current + step + (fundLow ? taxFundBump : 0)));
}

/**
 * The politics hand of a Classic seat: runs for office, votes and, as
 * Governor, sets the tax (WS7 spec RULE-8, RULE-63). It decides its candidacy
 * once per election cycle, ahead of the election or at the last call. In
 * announce and the ballot it acts once after a seeded pause and presses Done;
 * elsewhere in planning it acts at once. A refused move is not retried. It
 * times itself on the public phase, month and stage, and decides from observe().
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
    if (stage === 'announce') this.lastCall(obs, act);
    else this.vote(obs, obs.politics!.election!, act);
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

  /** RULE-63 rows 2 and 3: decide now if it has not, else refresh a Governor promise against the tax now. */
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
      act({ type: 'vote', office, candidate: this.choose(obs, candidates) });
    }
  }

  /**
   * Itself if it runs; a Rookie's seeded guess; else the smallest landowner, so the table leans against the leader.
   * A tie is a seeded draw, not the lower seat: in month 1 nobody owns land (AM-10). A lone minimum draws nothing.
   */
  private choose(obs: GameState, candidates: readonly string[]): string {
    if (candidates.includes(this.mind.me)) return this.mind.me;
    if (this.mind.levelId === 'rookie') return this.rng.pick(candidates);
    const fewest = Math.min(...candidates.map((id) => plotsOwned(obs, id)));
    const tied = candidates.filter((id) => plotsOwned(obs, id) === fewest);
    return tied.length === 1 ? tied[0]! : this.rng.pick(tied);
  }

  private govern(obs: GameState, act: Act): void {
    if (obs.politics!.governor !== this.mind.me) return;
    const current = Math.round(obs.treasury.salesTax * PERCENT);
    const next = nextTax(current, POLITICS.ai.taxTarget[this.persona], obs.treasury.money, taxBounds(obs), obs.month);
    if (next !== current) act({ type: 'setTax', percent: next });
  }
}
