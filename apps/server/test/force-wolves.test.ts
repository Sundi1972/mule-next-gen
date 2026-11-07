import { DEV_STEER, WOLVES, type DevFloor, type GameState } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { createRecordedGame } from '../src/record.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/**
 * forceWolves, a per-game test option (WS5's ask for the arcade moments; WS6's B-AC-5 browser step):
 * the first colonist out on wolf land meets a pack at once, the seeded roll forced to a pack, the cooldown kept. Off,
 * or absent, WOLVES' chance decides as before. A recorded game keeps it, so its replay meets the same packs.
 */
const TICK = DEV_STEER.tickMs;

function inDevelopment(options: { forceWolves?: boolean; politics?: boolean }) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, options);
  game.start(seats);
  const state: GameState = game['state']!;
  // Every plot forest, wolf land: the colonists come out of the store onto it.
  for (const t of state.tiles) if (t.terrain !== 'store') Object.assign(t, { terrain: 'forest', owner: null, outfit: null });
  readyAll(game);
  for (let i = 0; i < 10_000 && game.viewFor(null).phase !== 'development'; i++) fake.advance(100);
  expect(game.viewFor(null).phase).toBe('development');
  const floor = () => (game as unknown as { steering: { floor: DevFloor } }).steering.floor;
  return { game, state, floor, ...fake };
}

describe('forceWolves: a pack at once, for tests', () => {
  it('every colonist on wolf land meets a pack on its first tick out; nobody does without the option', () => {
    const forced = inDevelopment({ forceWolves: true });
    forced.advance(TICK);
    const out = forced.floor().colonists.filter((c) => c.space === 'map');
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.encounter !== null && c.encounter !== undefined), 'each one met a pack').toBe(true);

    const plain = inDevelopment({});
    plain.advance(TICK);
    // WOLVES' own chance (1% a tick): on this seed and tick nobody meets one.
    expect(plain.floor().colonists.filter((c) => c.space === 'map' && c.encounter)).toEqual([]);
  });

  it('the cooldown is kept: a colonist who got away meets no second pack before WOLVES.cooldownSeconds', () => {
    const g = inDevelopment({ forceWolves: true });
    g.advance(TICK);
    const id = g.floor().colonists.find((c) => c.space === 'map' && c.encounter)!.id;
    const first = g.floor().tick;
    const met: number[] = [];
    let had = true;
    for (let i = 0; i < 600 && g.game.viewFor(null).phase === 'development'; i++) {
      g.advance(TICK);
      const c = g.floor().colonists.find((x) => x.id === id)!;
      const has = Boolean(c.encounter);
      if (has && !had) met.push(g.floor().tick);
      had = has;
    }
    expect(met.length, 'forced, the next pack comes once the cooldown is over').toBeGreaterThan(0);
    for (const tick of met) expect((tick - first) * TICK, 'a second pack only past the cooldown').toBeGreaterThanOrEqual(WOLVES.cooldownSeconds * 1_000);
  });

  it('a recorded game keeps the option, and a game built from its options, as the replay builds one, is forced', () => {
    const fake = fakeContext();
    const { game, recorder } = createRecordedGame({ ctx: fake.ctx, seed: 7, options: { forceWolves: true, politics: false }, dir: null });
    game.start(seats);
    expect(recorder.record.options).toMatchObject({ forceWolves: true });
    // replay.ts builds its MuleGame from `{ ...record.options }`: the same options force the same packs.
    const replayed = inDevelopment({ ...recorder.record.options });
    replayed.advance(TICK);
    const out = replayed.floor().colonists.filter((c) => c.space === 'map');
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((c) => c.encounter)).toBe(true);
  });
});
