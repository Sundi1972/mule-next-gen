import { describe, expect, it } from 'vitest';
import { GAME, PHASES, type GameState } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll } from './fake-context.js';

// PR-F: the land grant is one pass of the light over the free plots, with no phase clock (Heiko option B). It ends
// earlier once every player has used their claims or pressed Done, the phone's Ready (Heiko option A, "Done with land").

/** Two humans and no AI, so nobody claims unless the test says so. */
const humans = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
];

/** A human and an AI that plays the grant as it would at a table. */
const withAnAi = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/** A game on the fake clock, through planning and into the land grant. */
function inTheGrant(table = humans, onChanged?: (at: number) => void) {
  const fake = fakeContext({ table, onChanged });
  const game = new MuleGame(fake.ctx, 7);
  game.start(table);
  readyAll(game);
  expect(game.viewFor(null).phase).toBe('landGrant');
  const freePlots = game.viewFor(null).tiles.filter((t) => t.terrain !== 'store' && t.owner === null).length;
  return { game, freePlots, ...fake };
}

/** The lit plot's tile index, read from the engine: a whole view on every millisecond would be slow. */
const litPlotOf = (state: GameState) => state.grant!.order[state.grant!.step];

describe('the land grant is one pass with no clock', () => {
  it('the land grant shows no countdown: phaseEndsAt is null on the phone and on the TV', () => {
    const { game } = inTheGrant();
    expect(game.viewFor('s1').phaseEndsAt).toBeNull();
    expect(game.viewFor(null).phaseEndsAt).toBeNull();
  });

  it('with no claims, the grant ends after exactly one pass: one tick per free plot, not at a phase clock and not after more passes', () => {
    const { game, freePlots, advance } = inTheGrant();
    let ticks = 0;
    while (game.viewFor(null).phase === 'landGrant' && ticks <= freePlots * 3) {
      advance(GRANT_TICK_MS);
      ticks++;
    }
    expect(ticks).toBe(freePlots);
    expect(game.viewFor(null).phase).toBe('development');
  });

  it('negative: once every player has used their claims, the grant ends at once, before the pass completes', () => {
    const { game, freePlots, advance } = inTheGrant();
    let ticks = 0;
    for (const id of humans.flatMap((h) => Array.from({ length: GAME.claimsPerGrant }, () => h.id))) {
      const lit = game.viewFor(id).lit!;
      game.handle(id, { type: 'claim', x: lit.x, y: lit.y });
      if (game.viewFor(null).phase !== 'landGrant') break;
      advance(GRANT_TICK_MS);
      ticks++;
    }
    expect(game.viewFor(null).phase).toBe('development');
    expect(ticks).toBeLessThan(freePlots);
  });

  it('Done with land: a human claims one plot and presses Ready once the AI has used its claims or pressed Done, and the grant ends at once', () => {
    const { game, freePlots, advance } = inTheGrant(withAnAi);
    const lit = game.viewFor('s1').lit!;
    game.handle('s1', { type: 'claim', x: lit.x, y: lit.y });
    const aiDone = () => game.viewFor(null).players.find((p) => p.id === 's3')!.ready;
    let ticks = 0;
    while (game.viewFor(null).phase === 'landGrant' && !aiDone() && ticks <= freePlots) {
      advance(GRANT_TICK_MS);
      ticks++;
    }
    expect(game.viewFor(null).phase, 'the human has a claim left and has not pressed Ready: the grant waits').toBe('landGrant');
    expect(aiDone(), 'the AI used its claims or pressed Done before the pass ended').toBe(true);
    expect(game.viewFor('s1').players.find((p) => p.id === 's1')!.ready).toBe(false);
    game.handle('s1', { type: 'ready' });
    expect(game.viewFor(null).phase, 'Ready is Done with land: the grant ends at once').not.toBe('landGrant');
  });

  it('negative: a human who presses Ready while the AI still wants land is shown done, and the grant goes on', () => {
    const { game } = inTheGrant(withAnAi);
    expect(game.viewFor(null).players.find((p) => p.id === 's3')!.ready, 'at the first plot the AI still wants land').toBe(false);
    game.handle('s1', { type: 'ready' });
    expect(game.viewFor(null).phase).toBe('landGrant');
    expect(game.viewFor(null).players.find((p) => p.id === 's1')!.ready).toBe(true);
  });

  it('fast-forward: once every human is done, the AI seats claim exactly what they claim at normal speed, and the light races through the rest of the pass', () => {
    const table = [
      { id: 's1', name: 'Heiko', isAi: false, color: 0 },
      { id: 's2', name: 'The Accountant', isAi: true, color: 1 },
      { id: 's3', name: 'The Baron', isAi: true, color: 2 },
      { id: 's4', name: 'The Grudge', isAi: true, color: 3 },
    ];
    const ais = table.filter((s) => s.isAi).map((s) => s.id);
    // The AI seats' plots when the grant ends, and how long it ran after Heiko was done.
    const play = (heikoDone: boolean) => {
      const g = inTheGrant(table);
      const state = (g.game as unknown as { state: GameState }).state;
      if (heikoDone) g.game.handle('s1', { type: 'ready' });
      const doneAt = g.ctx.now();
      const left = state.grant!.order.length - state.grant!.step;
      const lit = new Set<number>();
      // One millisecond at a time, so the presses' timers fire in the order of their reaction times, as on a real clock.
      for (let i = 0; i < 1_000_000 && state.phase === 'landGrant'; i++) {
        const at = state.grant && litPlotOf(state);
        if (at) lit.add(at);
        g.advance(1);
      }
      const owned = Object.fromEntries(ais.map((id) => [id, state.tiles.flatMap((t, i) => (t.owner === id ? [i] : [])).sort((a, b) => a - b)]));
      return { owned, lasted: g.ctx.now() - doneAt, left, lit: lit.size };
    };
    const fast = play(true);
    const normal = play(false);
    expect(Object.values(normal.owned).flat().length, 'the AI seats claim land at normal speed').toBeGreaterThan(0);
    expect(fast.owned, 'fast-forward resolves the AI presses as the normal ticks do').toEqual(normal.owned);
    expect(fast.lit, 'the TV sees the light move on plot by plot').toBeGreaterThan(1);
    expect(fast.lasted, 'the light races: one display step a plot left in the pass, and a little slack').toBeLessThanOrEqual(fast.left * PHASES.grantFastForwardMs + GRANT_TICK_MS);
  });

  it('fast-forward broadcasts once per move of the light: every phone and the TV build a view per broadcast', () => {
    const table = [
      { id: 's1', name: 'Heiko', isAi: false, color: 0 },
      { id: 's2', name: 'The Accountant', isAi: true, color: 1 },
      { id: 's3', name: 'The Baron', isAi: true, color: 2 },
    ];
    let broadcasts = 0;
    const g = inTheGrant(table, () => broadcasts++);
    const state = (g.game as unknown as { state: GameState }).state;
    g.game.handle('s1', { type: 'ready' });
    broadcasts = 0;
    let moves = 0;
    for (let i = 0; i < 1_000_000 && state.phase === 'landGrant'; i++) {
      const before = state.grant!.step;
      g.advance(1);
      if (state.phase !== 'landGrant' || state.grant!.step !== before) moves++;
    }
    const claims = state.players.filter((p) => p.id !== 's1').reduce((n, p) => n + p.claimsThisGrant, 0);
    expect(moves, 'the light raced through the rest of the pass').toBeGreaterThan(10);
    expect(broadcasts, 'one broadcast per move of the light, plus at most one per claim').toBeLessThanOrEqual(moves + claims);
  });
});
