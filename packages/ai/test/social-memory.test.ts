import { describe, expect, it } from 'vitest';
import { BRAIN, createGame, stableJson, type DealCard, type GameState } from '@mule/engine';
import { relationMemory } from '../src/social/index.js';
import type { PhaseFact } from '../src/playbook/index.js';

/** A stock count no game reaches, so a rival's goods leaking into memory is unmistakable. */
const RIVAL_STOCK = 86_421;

/** Three seats with politics on: p0 is the AI whose memory is read. */
function table(): GameState {
  return createGame({ seed: 11, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: i === 0 })), politics: true });
}

const stamp = (month: number, phase: PhaseFact['phase']) => ({ month, phase });
const NOTICES: PhaseFact[] = [
  { ...stamp(1, 'landGrant'), kind: 'claim', seat: 'p1', plot: 12 },
  { ...stamp(1, 'landGrant'), kind: 'claim', seat: 'p2', plot: 40 },
  { ...stamp(1, 'auction'), kind: 'declare', seat: 'p1', good: 'food', side: 'seller' },
  { ...stamp(1, 'auction'), kind: 'trade', good: 'food', buyer: 'p0', seller: 'p1', price: 31, qty: 2 },
  { ...stamp(1, 'auction'), kind: 'trade', good: 'energy', buyer: 'p2', seller: 'p1', price: 44, qty: 5 },
  { ...stamp(1, 'auction'), kind: 'trade', good: 'smithore', buyer: 'store', seller: 'p0', price: 52, qty: 3 },
  { ...stamp(2, 'landAuction'), kind: 'sale', item: 'plot', plot: 7, seller: 'p0', buyer: 'p2', price: 160 },
];
/**
 * p0's land ranking each month: plot 12 first in month 1, so p1's claim of it took a plot p0 wanted; plot 40 sits just
 * past BRAIN.social.wantedPlots, so p2's claim of it did not.
 */
const WANTED = new Map([[1, [12, ...Array.from({ length: BRAIN.social.wantedPlots - 1 }, (_, i) => 60 + i), 40]]]);

describe('relationship memory (spec B C2)', () => {
  it('T-AC-B7: memory is a pure function of the notices and public state; the same notices give an equal memory', () => {
    const state = table();
    const first = relationMemory(state, 'p0', NOTICES, WANTED);
    // A second run on copies of the same inputs.
    expect(stableJson(relationMemory(structuredClone(state), 'p0', structuredClone(NOTICES), new Map(WANTED)))).toBe(stableJson(first));
    // The notice list shuffled and then put back in its order: an equal memory.
    const shuffled = [...NOTICES].reverse();
    const restored = NOTICES.map((n) => shuffled.find((s) => stableJson(s) === stableJson(n))!);
    expect(stableJson(relationMemory(state, 'p0', restored, WANTED))).toBe(stableJson(first));
    // Neither the state nor the notices are changed by reading them.
    expect(stableJson(state)).toBe(stableJson(table()));

    // The counted facts, each between p0 and one other player only.
    expect(Object.keys(first).sort()).toEqual(['p1', 'p2']);
    expect(first.p1!.trades).toEqual([{ month: 1, good: 'food', qty: 2, price: 31, seller: 'them' }]);
    expect(first.p1!.tookWanted).toEqual([{ month: 1, plot: 12 }]);
    expect(first.p2!.trades).toEqual([]);
    expect(first.p2!.tookWanted).toEqual([]);
    expect(first.p2!.sales).toEqual([{ month: 2, item: 'plot', plot: 7, price: 160, seller: 'me' }]);
    for (const id of ['p1', 'p2']) expect(first[id]!.reputation).toBe(state.players.find((p) => p.id === id)!.reputation);
  });

  it('T-AC-B7: a candidacy promise and a pact kept or broken between the two are public facts memory keeps', () => {
    const state = table();
    state.politics!.candidates.governor = ['p1'];
    state.politics!.promises.p1 = { kind: 'lower' };
    const card = (id: string, from: string, to: string, status: DealCard['status'], brokenBy: string | null = null): DealCard => ({
      id,
      from,
      to,
      terms: { kind: 'pact' },
      offered: 1,
      until: 3,
      status,
      brokenBy,
      settled: status === 'active' ? null : 2,
    });
    state.politics!.deals = [card('deal-a', 'p0', 'p1', 'kept'), card('deal-b', 'p2', 'p0', 'broken', 'p2'), card('deal-c', 'p1', 'p0', 'active')];
    const memory = relationMemory(state, 'p0', [], new Map());
    expect(memory.p1!.running).toEqual({ office: 'governor', promise: { kind: 'lower' } });
    expect(memory.p1!.pacts).toEqual({ active: 1, kept: 1, brokenByThem: 0, brokenByMe: 0 });
    expect(memory.p2!.running).toBeNull();
    expect(memory.p2!.pacts).toEqual({ active: 0, kept: 0, brokenByThem: 1, brokenByMe: 0 });
  });

  it('T-AC-B5 (memory): no rival\'s goods or unanalysed ground enter memory; a whisper between two other players never does', () => {
    const state = table();
    const before = stableJson(relationMemory(state, 'p0', NOTICES, WANTED));
    // A rival's distinctive stock, the richest ground on every plot p0 has not analysed, and a pact between the two
    // others, private to them: none of it may move p0's memory.
    const hidden = structuredClone(state);
    hidden.players.find((p) => p.id === 'p1')!.stock.crystite = RIVAL_STOCK;
    hidden.tiles.forEach((t, i) => {
      if (t.terrain === 'store' || hidden.players[0]!.analysed.includes(i)) return;
      for (const g of Object.keys(t.ground) as (keyof typeof t.ground)[]) t.ground[g] = 4;
    });
    hidden.politics!.deals = [{ id: 'deal-x', from: 'p1', to: 'p2', terms: { kind: 'pact' }, offered: 1, until: 4, status: 'active', brokenBy: null, settled: null }];
    // A deal notice between the two others carries their parties: private to them.
    const privateNotice: PhaseFact = { ...stamp(1, 'planning'), kind: 'deal', event: 'active', deal: hidden.politics!.deals[0]!, parties: ['p1', 'p2'] };
    const after = stableJson(relationMemory(hidden, 'p0', [...NOTICES, privateNotice], WANTED));
    expect(after).toBe(before);
    expect(after).not.toContain(String(RIVAL_STOCK));
    expect(after).not.toContain('deal-x');
    // Memory reads no chat: its inputs are the state, the seat, the notices and the seat's own wanted plots.
    expect(relationMemory.length).toBeLessThanOrEqual(4);
  });
});
