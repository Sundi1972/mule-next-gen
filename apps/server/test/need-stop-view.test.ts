import type { GameState } from '@mule/engine';
import type { WalkerView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** Heiko's phone, Mia's phone and the TV: every view the server sends. */
const VIEWERS = ['s1', 's2', null] as const;

/**
 * Seed 31's Water good, as the replay test plays it: Heiko (s1) holds Water over his need and walks down to sell, Mia
 * (s2) walks up to buy, and the engine stops Heiko at the amount he must hold (RULE-4). At every walk tick, Heiko's
 * walker as each view shows it, beside whether the engine holds him.
 */
function waterWalk(): { held: boolean; views: WalkerView[] }[] {
  const { ctx, advance } = fakeContext({});
  const game = new MuleGame(ctx, 31, { maxMonths: 1, politics: false });
  // The game keeps its engine state private; the test reads it to know when the stop has happened.
  const engine = () => (game as unknown as { state: GameState }).state;
  game.start(seats);
  const ticks: { held: boolean; views: WalkerView[] }[] = [];
  let walking = false;
  for (let i = 0; i < 200_000; i++) {
    const view = game.viewFor(null);
    if (view.phase === 'planning' || view.phase === 'upkeep') for (const s of seats) if (!s.isAi && game.viewFor(null).phase === view.phase) game.handle(s.id, { type: 'ready' });
    const a = engine().auction;
    const water = a?.good === 'water';
    const pick = view.phase === 'auction' && view.auction?.stage === 'status' ? view.auction : null;
    if (pick && !(view.eventShow?.held && ctx.now() < view.eventShow.endsAt)) {
      const me = a!.status.find((r) => r.id === 's1')!;
      if (water && me.now > me.need && pick.walkers.find((w) => w.id === 's1')?.side !== 'seller') game.handle('s1', { type: 'declare', side: 'seller' });
      for (const s of seats) if (!s.isAi && !pick.walkers.find((w) => w.id === s.id)?.done) game.handle(s.id, { type: 'ready' });
    }
    if (water && a?.stage === 'walk') {
      if (!walking) {
        game.handle('s1', { type: 'walk', dir: 'down' });
        game.handle('s2', { type: 'walk', dir: 'up' });
        walking = true;
      }
      const held = !!a.walkers.find((w) => w.id === 's1')!.held;
      ticks.push({ held, views: VIEWERS.map((v) => game.viewFor(v).auction!.walkers.find((w) => w.id === 's1')!) });
      if (held) break;
    }
    if (walking && !water) break;
    advance(100);
  }
  return ticks;
}

describe('RULE-4: the auction view says a seller is held', () => {
  it("B-AC-B1 (view): every phone's and the TV's auction view marks the seller held once stopped at their need, and not before", { timeout: 60_000 }, () => {
    const ticks = waterWalk();

    const stop = ticks.at(-1);
    expect(stop?.held, 'the premise: the engine stopped Heiko at his need').toBe(true);
    expect(ticks.length, 'the premise: he walked before the stop').toBeGreaterThan(1);
    for (const [k, view] of stop!.views.entries()) expect(view.held, `${VIEWERS[k] ?? 'the TV'} sees him held`).toBe(true);
    for (const t of ticks.slice(0, -1)) {
      for (const [k, view] of t.views.entries()) expect('held' in view, `${VIEWERS[k] ?? 'the TV'} shows no hold before the stop`).toBe(false);
    }
  });
});
