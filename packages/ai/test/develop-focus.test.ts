import { describe, expect, it } from 'vitest';
import { advancePhase, AI_LEVELS, AI_PERSONAS, createGame, observe, stableJson, type GameState, type Good, type Outfit } from '@mule/engine';
import { developDecision, type DevAction } from '../src/strategist.js';
import type { Candidate } from '../src/utility.js';
import type { Mind } from '../src/value.js';

const mind: Mind = { me: 'ai0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };

/** Development in month 1 with ai0 rich and fed, holding three idle plots. */
function development(): GameState {
  const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles.filter((t) => !t.owner && t.terrain !== 'store').slice(0, 3)) t.owner = 'ai0';
  const me = state.players[0]!;
  me.money = 5_000;
  me.stock.food = 20;
  me.stock.energy = 20;
  return state;
}

const outfitOf = (c: Candidate<DevAction>): Outfit | null => (c.action.kind === 'install' ? c.action.outfit : null);
const rankOf = (all: Candidate<DevAction>[], good: Good) => all.findIndex((c) => outfitOf(c) === good);

describe('development focus', () => {
  it('T-AC-15: with focus the focus good ranks higher; without it the utilities are identical', () => {
    const obs = observe(development(), 'ai0');
    const today = developDecision(obs, mind, 0);
    const live = today.all.filter((c) => !c.veto);
    const top = outfitOf(live[0]!);
    // The runner-up good: the best live outfit that is not the top pick's.
    const focus = live.map(outfitOf).find((o): o is Good => o !== null && o !== 'greenBelt' && o !== top)!;
    expect(rankOf(today.all, focus)).toBeGreaterThan(0);

    const leaning = developDecision(obs, mind, 0, undefined, focus);
    expect(rankOf(leaning.all, focus)).toBeLessThan(rankOf(today.all, focus));

    // A lean, not a rule: what a hard rule rules out stays ruled out.
    const vetoes = (l: typeof today) => l.all.filter((c) => c.veto).map((c) => [c.key, c.veto]);
    const ruledOut = today.all.find((c) => c.veto && outfitOf(c) !== null)!;
    expect(vetoes(developDecision(obs, mind, 0, undefined, outfitOf(ruledOut) as Good))).toEqual(vetoes(today));

    // Negative: with focus null the whole shortlist is today's, with or without a walk.
    expect(stableJson(developDecision(obs, mind, 0, undefined, null))).toBe(stableJson(today));
    const walk = { at: 'store' as const, left: 30, taps: 4 };
    expect(stableJson(developDecision(obs, mind, 1, walk, null))).toBe(stableJson(developDecision(obs, mind, 1, walk)));
  });
});
