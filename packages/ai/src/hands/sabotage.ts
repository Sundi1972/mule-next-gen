import { captureOdds, canOrder, createRng, GOODS, orderTerms, pactBetween, POLITICS, sabotagePossible, type AiPersonaId, type GameState, type Rng, type SabotageOrder, type SabotageTarget } from '@mule/engine';
import type { Act } from '../actions.js';
import { captureCost, sabotageGain } from '../politics-value.js';
import { cashReserve, type Mind } from '../value.js';

/**
 * A hand's own stream for this seat and month (S4-HC-9): it hashes the seat's salt and the hand's own, never the game's
 * seed (which observe() hides), so no draw here moves the election's or the council's stream.
 */
export function handStream(mind: Mind, month: number, handSalt: number): Rng {
  // Every seat's mind carries its own salt (AiSeat); without one, seats would share a coin (INV-41).
  if (mind.salt === undefined) throw new Error("A politics hand's mind needs the seat's salt: build it with AiSeat");
  return createRng((Math.imul(mind.salt ^ handSalt, 1_000_003) ^ Math.imul(month, 7_919)) >>> 0); // literal-ok: hashing constants (primes) that make one stream per seat, hand and month
}

const ORDER_SALT = 0x5ab0c1e5; // literal-ok: this hand (not POLITICS.sabotage.streamSalt, the order-id stream's)'s salt, a stream label and not a balance number
const WEIGHT_OF_ONE = 1; // literal-ok: no grudge weighs a victim as 1, a definition

/**
 * The AI's sabotage order (S4-C10, S4-RULE-13): once a month in planning proper, the order with the best net of spite
 * times WS1's gain (weighted up against a victim who was caught sabotaging this seat), less the crew, less the expected
 * capture. It reads observe() only and draws from its own stream, and only once everything else says yes.
 */
export class SabotageHand {
  constructor(private readonly mind: Mind) {}

  order(obs: GameState, act: Act): void {
    const me = this.mind.me;
    const { spite } = this.mind.persona;
    if (!sabotagePossible(obs) || canOrder(obs, me) !== true || !this.mind.level.sabotage || spite <= 0) return;
    const politics = obs.politics!;
    if (politics.sabotage.some((o) => o.by === me && o.month === obs.month && o.outcome === 'pending')) return;
    const money = obs.players.find((p) => p.id === me)?.money ?? 0;
    const { minEdge, grudge, orderChance } = POLITICS.ai.sabotage;
    const terms = orderTerms(obs);
    const grudged = new Set(politics.sabotage.filter((o) => o.culpritPublic && o.victim === me && o.by !== null).map((o) => o.by));
    let best: { target: SabotageTarget; net: number; cost: number } | null = null;
    for (const target of this.targets(obs)) {
      const order: SabotageOrder = { id: '', by: me, month: obs.month, target, cost: terms[target.kind].cost, outcome: 'pending', culpritPublic: false };
      const victim = target.kind === 'powerCut' ? obs.tiles[target.tile]!.owner : null;
      const weight = victim !== null && grudged.has(victim) ? grudge : WEIGHT_OF_ONE;
      const net = spite * sabotageGain(obs, me, order) * weight - order.cost - captureOdds(obs, order) * captureCost(obs, me, order);
      if (best === null || net > best.net) best = { target, net, cost: order.cost };
    }
    if (best === null || best.net < minEdge || best.cost > money - cashReserve(obs, this.mind)) return;
    if (!handStream(this.mind, obs.month, ORDER_SALT).chance(orderChance[this.mind.personaId as AiPersonaId])) return;
    act({ type: 'sabotage', target: best.target });
  }

  /** A power cut on each working plot of another player the Sheriff does not guard (only a Sheriff sees any), a rumour on each good both ways. */
  private targets(obs: GameState): SabotageTarget[] {
    const guarded = obs.politics!.guards;
    const out: SabotageTarget[] = [];
    obs.tiles.forEach((t, tile) => {
      if (t.owner !== null && t.owner !== this.mind.me && (GOODS as readonly string[]).includes(t.outfit ?? '') && !guarded.includes(tile)) out.push({ kind: 'powerCut', tile });
    });
    for (const good of GOODS) for (const dir of ['up', 'down'] as const) out.push({ kind: 'rumour', good, dir });
    return out;
  }
}

/** True where a pact binds the two in the order's month: the one place the hands ask pactBetween. */
export function pacted(obs: GameState, a: string, b: string, month: number): boolean {
  return pactBetween(obs, a, b, month) !== null;
}
