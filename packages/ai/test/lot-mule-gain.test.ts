import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, createRng, list, lotDone, observe, RuleError, setLotWalk, stepLandAuction, WALK, type GameState, type Listing, type LotResult, type Outfit } from '@mule/engine';
import type { Act } from '../src/actions.js';
import { LotHand } from '../src/hands/lot.js';
import { outlook } from '../src/outlook.js';
import { AiSeat } from '../src/seat.js';
import { installGain } from '../src/value.js';

const ME = 'ai0';
const SELLER = 'p0';

/** The AI's moves through the engine calls the server makes for a phone. */
function actFor(state: GameState, id: string): Act {
  return (action) => {
    try {
      if (action.type === 'walk') setLotWalk(state, id, action.dir);
      else if (action.type === 'done') lotDone(state, id, action.done);
      return true;
    } catch (err) {
      if (err instanceof RuleError) return false;
      throw err;
    }
  };
}

describe('the AI bids for a lot MULE only what its outfit gains on its own land (FM-lot-mule-gain)', () => {
  it('FM-lot-mule-gain: a seat with no plot that suits an Energy MULE does not bid for one, and bids for a Food MULE that suits its land', () => {
    // A lot MULE comes outfitted (lots.ts: carriedMule = the lot's outfit), and on the floor it can't be re-outfitted
    // (game.ts: only a MULE taken off a plot can be). WS9 measured that 40-46% of led MULEs have no own plot where their
    // outfit's install gain is positive: each was paid for at the land auction and earns nothing.
    const state = createGame({ seed: 4, players: [{ id: SELLER, name: 'Brix', isAi: false }, { id: ME, name: 'AI 1', isAi: true }] });
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    for (const t of state.tiles) if (t.owner) t.owner = null;
    const free = state.tiles
      .filter((t) => t.terrain !== 'lake' && t.terrain !== 'store' && !t.special)
      .sort((a, b) => Math.abs(a.x - store.x) + Math.abs(a.y - store.y) - (Math.abs(b.x - store.x) + Math.abs(b.y - store.y)));
    // The AI's land: the plots nearest the store, idle. The seller's: two further off, each with a MULE it lists.
    for (const t of free.slice(0, 4)) t.owner = ME;
    const lots: Record<string, Outfit> = {};
    for (const [t, outfit] of [
      [free[10]!, 'energy'],
      [free[11]!, 'food'],
    ] as const) {
      Object.assign(t, { owner: SELLER, outfit, runMonths: 2 });
      lots[`${t.x},${t.y}`] = outfit;
    }
    state.players.find((p) => p.id === ME)!.money = 5_000;
    for (const t of free.slice(10, 12)) list(state, SELLER, { item: { kind: 'mule', x: t.x, y: t.y }, minimum: 50, unsold: 'keep' });
    while (state.phase !== 'landAuction') advancePhase(state);
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    // The case: no own plot gains from an Energy MULE, and one does from a Food MULE.
    const obs = observe(state, ME);
    const o = outlook(obs, ME, { lookAhead: seat.mind.level.lookAhead });
    const best = (outfit: Outfit) => Math.max(...obs.tiles.filter((t) => t.owner === ME).map((t) => installGain(obs, o, t, outfit, seat.mind).gain));
    expect(best('energy'), 'no own plot an Energy MULE suits').toBeLessThanOrEqual(0);
    expect(best('food'), 'an own plot a Food MULE suits').toBeGreaterThan(0);
    const hand = new LotHand(seat.mind, createRng(7));
    const results: { outfit: Outfit | undefined; result: LotResult }[] = [];
    // literal-ok: a runaway guard in ticks, not a game clock
    for (let t = 0; state.phase === 'landAuction' && state.landAuction?.stage !== 'over' && t < 20_000; t++) {
      const lot: Listing | null = state.landAuction!.lot;
      hand.tick(state, WALK.tickMs, actFor(state, ME));
      const result = stepLandAuction(state, WALK.tickMs);
      if (result && lot) results.push({ outfit: lot.item.kind === 'mule' ? lots[`${lot.item.x},${lot.item.y}`] : undefined, result });
    }
    // The promise, at the bell: the Food MULE is the seat's, the Energy MULE stays with its seller, unbid.
    expect(results.map((r) => [r.outfit, r.result.kind === 'sold' ? r.result.buyer : r.result.kind])).toEqual([
      ['energy', 'kept'],
      ['food', ME],
    ]);
  });
});
