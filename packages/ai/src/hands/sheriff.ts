import { canGuard, fineable, GOODS, guardsMax, isPublicOrder, POLITICS, sabotagePossible, score, sheriffCanAct, type GameState, type SabotageOrder } from '@mule/engine';
import type { Act } from '../actions.js';
import { guardValue, investigateValue } from '../politics-value.js';
import type { Mind } from '../value.js';
import { handStream, pacted } from './sabotage.js';

const SHERIFF_SALT = 0x5e71ff00; // literal-ok: this hand's salt, a stream label and not a balance number

/**
 * The AI Sheriff's job (S4-C10, S4-RULE-13), once a month in planning proper after the votes: post the guards,
 * investigate one case, fine every revealed culprit. Only the sitting Sheriff acts; it reads observe() only and draws
 * from its own stream, and only where a tie or a Rookie's guess needs it.
 */
export class SheriffHand {
  constructor(private readonly mind: Mind) {}

  /** `look` gives a fresh observe copy, so a fine can follow an investigation that has just named its culprit. */
  run(obs: GameState, act: Act, look: () => GameState = () => obs): void {
    if (!sabotagePossible(obs) || sheriffCanAct(obs, this.mind.me) !== true) return;
    this.guard(obs, act);
    this.investigate(obs, act);
    this.fine(look(), act);
  }

  private get rookie(): boolean {
    return this.mind.levelId === 'rookie';
  }

  private workingPlots(obs: GameState): number[] {
    return obs.tiles.flatMap((t, tile) => (canGuard(obs, this.mind.me, tile) === true && (GOODS as readonly string[]).includes(t.outfit ?? '') ? [tile] : []));
  }

  /** The guardsMax plots with the highest guardValue, a tie at the cut drawn; a Rookie draws among the working plots. A plot worth nothing to guard is not posted. */
  private guard(obs: GameState, act: Act): void {
    const max = guardsMax(obs);
    const rng = handStream(this.mind, obs.month, SHERIFF_SALT);
    const plots = this.workingPlots(obs);
    let posted: number[];
    if (this.rookie) {
      posted = rng.shuffle(plots).slice(0, max);
    } else {
      const ranked = plots.map((tile) => ({ tile, worth: guardValue(obs, this.mind.me, tile) })).filter((p) => p.worth > 0).sort((a, b) => b.worth - a.worth || a.tile - b.tile);
      const cut = ranked[max - 1]?.worth;
      const sure = ranked.filter((p) => cut === undefined || p.worth > cut);
      const tied = ranked.filter((p) => cut !== undefined && p.worth === cut);
      posted = sure.map((p) => p.tile);
      if (cut !== undefined && tied.length > max - sure.length) {
        posted = [...posted, ...rng.shuffle(tied.map((p) => p.tile)).slice(0, max - sure.length)];
      } else posted = [...posted, ...tied.map((p) => p.tile)].slice(0, max);
    }
    if (posted.length > 0) act({ type: 'guard', tiles: posted });
  }

  /** The public case with the culprit unknown and never investigated: the highest investigateValue if above 0; a Rookie's the newest. */
  private investigate(obs: GameState, act: Act): void {
    const cases = obs.politics!.sabotage;
    if (cases.filter((o) => o.investigated === obs.month).length >= POLITICS.sheriff.investigations) return;
    const open = cases.filter((o) => isPublicOrder(o) && !o.culpritPublic && o.investigated == null);
    if (this.rookie) {
      const newest = open.at(-1);
      if (newest) act({ type: 'investigate', order: newest.id });
      return;
    }
    let best: { order: SabotageOrder; worth: number } | null = null;
    for (const order of open) {
      const worth = investigateValue(obs, this.mind.me, order);
      if (worth > 0 && (best === null || worth > best.worth)) best = { order, worth };
    }
    if (best) act({ type: 'investigate', order: best.order.id });
  }

  /** Every case it may fine: the leader base on the Worth leader, the partner base on a pact partner, else the standard; a Rookie the standard. */
  private fine(obs: GameState, act: Act): void {
    const me = this.mind.me;
    const { leader, partner } = POLITICS.ai.sheriff.fine;
    const front = obs.players.reduce((best, p) => (score(obs, p.id) > score(obs, best.id) ? p : best)).id;
    for (const id of fineable(obs, me)) {
      const order = obs.politics!.sabotage.find((o) => o.id === id)!;
      let amount = POLITICS.sheriff.fine.standard;
      if (!this.rookie && order.by === front) amount = leader;
      else if (!this.rookie && order.by !== null && pacted(obs, me, order.by, order.month)) amount = partner;
      act({ type: 'fine', order: id, amount });
    }
  }
}
