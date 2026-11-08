import {
  budgetLines,
  budgetShares,
  canOverrule,
  lineMaxCredits,
  moodBand,
  PERCENT,
  POLITICS,
  spare,
  stillNeeds,
  voteWeight,
  type AiPersonaId,
  type BudgetLine,
  type GameState,
} from '@mule/engine';
import type { Act } from '../actions.js';
import { lineWorth, overruleWorth } from '../politics-value.js';
import type { Mind } from '../value.js';
import { handStream } from './sabotage.js';

const OVERRULE_SALT = 0x0b7e11ed; // literal-ok: this hand's stream label, distinct from the order and Sheriff hands' and the council's; not a balance number
const OPEN_STAGES = ['commissioned', 'building'];

type Shares = Record<BudgetLine, number>;

/**
 * The AI Governor's budget (S5-C6, S5-RULE-11), once a month in planning proper after the tax: the persona's base
 * shares, then Welfare (and, after the first release, Security) filled one step at a time while its worth beats what
 * Projects loses. Projects never drops below the share that covers the open buildings' credits. A Rookie sets its base
 * shares and stops. It reads observe() only and draws nothing.
 */
export class BudgetHand {
  constructor(private readonly mind: Mind) {}

  /** Returns whether it sent a budget. */
  split(obs: GameState, act: Act): boolean {
    const politics = obs.politics;
    if (!politics || politics.governor !== this.mind.me || obs.phase !== 'planning') return false;
    if (politics.overrule?.month === obs.month && politics.overrule.target === 'budget') return false;
    const lines = budgetLines(obs);
    const room = spare(obs);
    const { step } = POLITICS.budget;
    const credits = (l: BudgetLine, share: number) => Math.min(Math.floor((share * room) / PERCENT), lineMaxCredits(l) ?? Infinity);
    const cover = this.covering(obs, room);
    const base = POLITICS.ai.budget.base[this.mind.personaId as AiPersonaId];
    const others = lines.filter((l) => l !== 'projects');
    const shares: Shares = { projects: 0, welfare: 0, security: 0 };
    // Each line takes its base against what the covering share and the lines before it leave; Projects takes the rest (AM-11).
    let remaining = PERCENT - cover;
    for (const l of others) {
      shares[l] = Math.min(base[l as Exclude<BudgetLine, 'projects'>], POLITICS.budget[l].maxShare, remaining);
      remaining -= shares[l];
    }
    shares.projects = cover + remaining;
    if (this.mind.levelId !== 'rookie') this.fill(obs, shares, others, cover, credits, step);
    const now = budgetShares(obs);
    if (lines.every((l) => shares[l] === now[l])) return false;
    return act({ type: 'setBudget', shares });
  }

  /** The smallest share, in steps, whose credits at today's spare cover what the open buildings still need; 0 where none is open. */
  private covering(obs: GameState, room: number): number {
    const need = (obs.colony?.projects ?? []).filter((p) => OPEN_STAGES.includes(p.stage)).reduce((sum, p) => sum + Math.max(0, stillNeeds(p).credits), 0);
    if (need <= 0) return 0;
    if (room <= 0) return PERCENT;
    const { step } = POLITICS.budget;
    return Math.min(PERCENT, Math.ceil((need * PERCENT) / room / step) * step);
  }

  /** One step at a time to the line whose worth gain, tilted by the persona, beats what the step takes from Projects (AM-11: every step comes from Projects, down to its covering share). */
  private fill(obs: GameState, shares: Shares, others: BudgetLine[], cover: number, credits: (l: BudgetLine, share: number) => number, step: number): void {
    const me = this.mind.me;
    const tilt = POLITICS.ai.budget.tilt[this.mind.personaId as AiPersonaId];
    for (;;) {
      if (shares.projects - step < cover) return;
      const cost = lineWorth(obs, me, 'projects', credits('projects', shares.projects)) - lineWorth(obs, me, 'projects', credits('projects', shares.projects - step));
      let best: { line: BudgetLine; net: number } | null = null;
      for (const l of others) {
        if (shares[l] + step > POLITICS.budget[l].maxShare) continue;
        const gain = (lineWorth(obs, me, l, credits(l, shares[l] + step)) - lineWorth(obs, me, l, credits(l, shares[l]))) * tilt[l as Exclude<BudgetLine, 'projects'>];
        const net = gain - cost;
        if (net > 0 && (best === null || net > best.net)) best = { line: l, net };
      }
      if (best === null) return;
      shares[best.line] += step;
      shares.projects -= step;
    }
  }
}

/**
 * The AI's overrule on the tax (S5-C6, S5-RULE-12): a non-Governor Classic seat calls it where the change costs it
 * enough and a majority of the votes would gain (or, as a protest, on a draw), and votes when the ballot opens. It
 * reads observe() only and draws from its own seat-salted stream, never the game's seed or the council's.
 */
export class OverruleHand {
  /** The Governor settings it has judged, as `month:tax%`: each is judged once. */
  private judged = new Set<string>();

  constructor(private readonly mind: Mind) {}

  private static key(state: GameState): string {
    return `${state.month}:${Math.round(state.treasury.salesTax * PERCENT)}`;
  }

  /** Whether the tax now is a setting this seat has not judged: a check cheap enough to run on every tick, on the state itself. */
  due(state: GameState): boolean {
    return state.politics !== null && this.mind.levelId !== 'rookie' && !this.judged.has(OverruleHand.key(state));
  }

  call(obs: GameState, act: Act): void {
    if (this.mind.levelId === 'rookie' || !obs.politics) return;
    if (canOverrule(obs, this.mind.me).tax !== true) return;
    const key = OverruleHand.key(obs);
    if (this.judged.has(key)) return;
    this.judged.add(key);
    const { minGain, longShot } = POLITICS.ai.overrule;
    if (overruleWorth(obs, this.mind.me, 'tax') < minGain) return;
    const governor = obs.politics.governor;
    let total = 0;
    let yes = 0;
    for (const p of obs.players) {
      const weight = voteWeight(obs, p.id).total;
      total += weight;
      if (p.id !== governor && (p.id === this.mind.me || overruleWorth(obs, p.id, 'tax') > 0)) yes += weight;
    }
    // literal-ok: more than half of all votes is the rule's definition (S5-RULE-8)
    const needed = Math.floor(total / 2) + 1;
    // The stream is per seat and per month, so a seat has one protest coin a month; a month allows one call.
    if (yes >= needed || handStream(this.mind, obs.month, OVERRULE_SALT).chance(longShot[this.mind.personaId as AiPersonaId])) act({ type: 'callOverrule', target: 'tax' });
  }

  /** One ballot, then Done; a seat that has voted votes no second time. */
  vote(obs: GameState, act: Act): void {
    const overrule = obs.politics?.overrule;
    if (overrule?.stage !== 'ballot' || overrule.done.includes(this.mind.me)) return;
    const me = this.mind.me;
    const { rookieYes, unhappyTilt } = POLITICS.ai.overrule;
    let yes: boolean;
    if (obs.politics!.governor === me) yes = false;
    else if (overrule.caller === me) yes = true;
    else if (this.mind.levelId === 'rookie') yes = handStream(this.mind, obs.month, OVERRULE_SALT).chance(rookieYes);
    else {
      const unhappy = obs.colony !== null && POLITICS.ai.colony.leanIn.includes(moodBand(obs.colony.happiness));
      yes = overruleWorth(obs, me) > (unhappy ? -unhappyTilt : 0);
    }
    act({ type: 'voteOverrule', yes });
    act({ type: 'done', done: true });
  }
}
