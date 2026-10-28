import {
  canRun,
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

const OFFICES: readonly Office[] = ['governor', 'sheriff'];

/**
 * The Governor's next rate: a step toward the target of at most maxStep, a bump when the fund is low, inside the bounds.
 * The fund starts empty, so it counts as low only from month 2, after the offices' first payday. See WS7 spec RULE-8, AM-9.
 */
export function nextTax(current: number, target: number, fund: number, bounds: { low: number; high: number }, month: number): number {
  const { maxStep } = POLITICS.tax;
  const { taxFundBump, fundMonths } = POLITICS.ai;
  const step = Math.max(-maxStep, Math.min(maxStep, target - current));
  const fundLow = month > 1 && fund < fundMonths * (POLITICS.pay.governor + POLITICS.pay.sheriff);
  return Math.max(bounds.low, Math.min(bounds.high, current + step + (fundLow ? taxFundBump : 0)));
}

/**
 * The politics hand of a Classic seat: runs for office, votes and, as
 * Governor, sets the tax (WS7 spec RULE-8). It acts once per stage after a
 * seeded pause and presses Done; a refused move is not retried. It times
 * itself on the public phase, month and stage, and decides from observe().
 */
export class VoteHand {
  /** month:stage of the stage it last saw. */
  private key = '';
  private waitMs = 0;
  private acted = false;

  constructor(
    readonly mind: Mind,
    private readonly rng: Rng,
  ) {}

  /** Call before stepElection, with the same (phaseScale-divided) dt. */
  tick(state: GameState, dt: number, act: Act): void {
    if (state.phase !== 'planning' || !state.politics) return;
    const stage: Election['stage'] = state.politics.election?.stage ?? 'over';
    const key = `${state.month}:${stage}`;
    if (key !== this.key) {
      this.key = key;
      this.acted = false;
      this.waitMs = stage === 'nominate' || stage === 'ballot' ? this.rng.int(...POLITICS.ai.actMs) : 0;
    }
    if (this.acted || stage === 'reveal') return;
    this.waitMs -= dt;
    if (this.waitMs > 0) return;
    this.acted = true;

    const obs = observe(state, this.mind.me);
    if (stage === 'over') return this.govern(obs, act);
    if (stage === 'nominate') this.nominate(obs, act);
    else this.vote(obs, obs.politics!.election!, act);
    act({ type: 'done', done: true });
  }

  private get persona(): AiPersonaId {
    return this.mind.personaId as AiPersonaId;
  }

  private nominate(obs: GameState, act: Act): void {
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
    for (const office of OFFICES) {
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
