import { describe, expect, it } from 'vitest';
import { advancePhase, buildFloor, createGame, DEV_STEER, doorOutside, reachOf, stepFloor, type DevFloor, type FloorConfig, type GameState } from '@mule/engine';
import { simFloorConfig } from '../src/floor-turn.js';
import { FloorWalker } from '../src/hands/floor-walker.js';
import { AiSeat } from '../src/seat.js';

const ME = 'ai0';

/**
 * Month 1's development for two AI seats, ai0 with a plains plot of its own, on a constructed floor config whose doors
 * hold their Reach off: a door's mouth reaches a quarter of the body's width, so the spot the walker heads for outside
 * it, a body's width out, never offers ENTER. Nothing applies a press here: the step can only stand or walk.
 */
function heldDoors(): { state: GameState; cfg: FloorConfig; floor: DevFloor } {
  const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner === ME) t.owner = null;
  const plot = state.tiles.find((t) => t.terrain === 'plains' && t.owner === null)!;
  plot.owner = ME;
  const live = simFloorConfig();
  const cfg: FloorConfig = { ...live, steer: { ...live.steer, doorHalfTiles: live.steer.bodyTiles / 4 } };
  // It starts where the walker heads for, a body's width out from the left door's mouth, as from a walk on the map.
  const mouth = doorOutside(state, 'doorL', cfg);
  const built = buildFloor(state, cfg);
  const floor = { ...built, colonists: built.colonists.map((c) => (c.id === ME ? { ...c, space: 'map' as const, x: mouth.x - cfg.steer.bodyTiles, y: mouth.y } : c)) };
  return { state, cfg, floor };
}

const where = (floor: DevFloor) => floor.colonists.find((c) => c.id === ME)!;

describe('the floor walker gives up a step it cannot get any closer to (arcade C9, #228 review)', () => {
  it('C9: outside a door whose Reach never offers ENTER, the step fails within botStuckTicks of standing still', () => {
    const { state, cfg } = heldDoors();
    let { floor } = heldDoors();
    const walker = new FloorWalker(ME);
    const view = () => ({ state, floor, cfg, secondsLeft: 40 });
    let still = 0;
    let failed: string | null = null;
    // literal-ok: a bound on the walk to the door, many times what it takes
    for (let tick = 0; tick < 2_000 && failed === null; tick++) {
      const run = walker.run(view(), { type: 'buyMule' }, 0);
      if (run.kind === 'failed') failed = run.why;
      if (run.kind !== 'going') break;
      const before = where(floor);
      floor = stepFloor(floor, state, { [ME]: run.input }, cfg.steer.tickMs, cfg);
      const after = where(floor);
      still = before.x === after.x && before.y === after.y && before.space === after.space ? still + 1 : 0;
      expect(reachOf(floor, state, ME, cfg).kind, 'the door holds ENTER off').not.toBe('enter');
    }
    expect(failed).toBe('stuck');
    expect(where(floor).space, 'it never got in').toBe('map');
    expect(still).toBeLessThanOrEqual(cfg.steer.botStuckTicks);
  });

  it('C9: the hand drops the stuck MULE and goes on to the pub', () => {
    const { state, cfg } = heldDoors();
    let { floor } = heldDoors();
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    // literal-ok: a bound in ticks, under the clock's 1,000
    for (let tick = 0; tick < 900; tick++) {
      const input = seat.developSteer(state, floor, DEV_STEER.tickMs * (900 - tick) / 1_000 + 5, cfg);
      floor = stepFloor(floor, state, { [ME]: input }, cfg.steer.tickMs, cfg);
    }
    const log = seat.developLog();
    const buy = log.findIndex((s) => s.label.startsWith('Buy a MULE'));
    expect(buy, JSON.stringify(log)).toBeGreaterThanOrEqual(0);
    expect(log[buy]!.ok).toBe(false);
    expect(log.slice(buy + 1).some((s) => s.label === 'Go to the pub'), JSON.stringify(log)).toBe(true);
  });
});
