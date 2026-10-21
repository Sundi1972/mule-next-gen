import {
  canRun,
  observe,
  plotsOwned,
  POLITICS,
  taxBounds,
  type AiPersonaId,
  type Election,
  type GameState,
  type Office,
  type Rng,
} from '@mule/engine';
import type { Act } from '../actions.js';
import type { Mind } from '../value.js';

const OFFICES: readonly Office[] = ['governor', 'sheriff'];

/** The Governor's next rate: a step toward the target of at most maxStep, a bump when the fund is low, inside the bounds. See WS7 spec RULE-8. */
export function nextTax(current: number, target: number, fund: number, bounds: { low: number; high: number }): number {
  const { maxStep } = POLITICS.tax;
  const { taxFundBump, fundMonths } = POLITICS.ai;
  const step = Math.max(-maxStep, Math.min(maxStep, target - current));
  const fundLow = fund < fundMonths * (POLITICS.pay.governor + POLITICS.pay.sheriff);
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
    if (may.governor === true && this.rng.next() < runGovernor[this.persona]) act({ type: 'run', office: 'governor' });
    else if (may.sheriff === true && this.rng.next() < runSheriff[this.persona]) act({ type: 'run', office: 'sheriff' });
  }

  private vote(obs: GameState, election: Readonly<Election>, act: Act): void {
    for (const office of OFFICES) {
      const candidates = election.candidates[office];
      if (candidates.length < 2) continue;
      act({ type: 'vote', office, candidate: this.choose(obs, candidates) });
    }
  }

  /** Itself if it runs; a Rookie's seeded guess; else the smallest landowner, so the table leans against the leader. */
  private choose(obs: GameState, candidates: readonly string[]): string {
    if (candidates.includes(this.mind.me)) return this.mind.me;
    if (this.mind.levelId === 'rookie') return this.rng.pick(candidates);
    const seat = (id: string) => obs.players.findIndex((p) => p.id === id);
    return [...candidates].sort((a, b) => plotsOwned(obs, a) - plotsOwned(obs, b) || seat(a) - seat(b))[0]!;
  }

  private govern(obs: GameState, act: Act): void {
    if (obs.politics!.governor !== this.mind.me) return;
    const current = Math.round(obs.treasury.salesTax * 100);
    const next = nextTax(current, POLITICS.ai.taxTarget[this.persona], obs.treasury.money, taxBounds(obs));
    if (next !== current) act({ type: 'setTax', percent: next });
  }
}
