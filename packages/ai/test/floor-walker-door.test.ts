import { describe, expect, it } from 'vitest';
import { advancePhase, buildFloor, createGame, doorOutside, HALL_DOORS, placeAt, reachOf, stepFloor, type DevFloor, type HallDoor } from '@mule/engine';
import { backToDoor, doorTable, hallSeconds, leading, mapFactor } from '../src/floor-time.js';
import { simFloorConfig } from '../src/floor-turn.js';
import { FloorWalker } from '../src/hands/floor-walker.js';

const ME = 'ai0';

describe('the floor walker enters by the door the plan priced (FM-walker-door, for FM-hurry-margin)', () => {
  it('FM-walker-door: back on the map at the right door leading an empty MULE, it walks round to the left door the Food counter is priced through, not in by the right', () => {
    // Seed 17's month 6 under WS5's PR-4 prices (#604), ai2: back from a glint race out of the right door, it stood at
    // that door's mouth leading the MULE it had bought. The plan priced the Food counter through the left door (5.40 s:
    // round the store, then a short hall); the walker pressed the ENTER the right door offered and led the MULE the
    // length of the hall (8.80 s). The 3.4 s cost it the install by 0.04 s.
    const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    state.players.find((p) => p.id === ME)!.carriedMule = 'empty';
    const cfg = simFloorConfig();
    const mouth = doorOutside(state, 'doorR', cfg);
    const built = buildFloor(state, cfg);
    let floor: DevFloor = { ...built, colonists: built.colonists.map((c) => (c.id === ME ? { ...c, space: 'map' as const, x: mouth.x, y: mouth.y, lead: { good: null, x: mouth.x, y: mouth.y } } : c)) };
    const me = () => floor.colonists.find((c) => c.id === ME)!;

    // The premise: the right door offers ENTER where it stands, and the plan's price (floor-time secondsToPlace, the
    // quickest door) goes through the left door.
    expect(reachOf(floor, state, ME, cfg).kind, 'the right door offers ENTER').toBe('enter');
    const c0 = me();
    const price = (door: HallDoor) =>
      backToDoor(state, cfg, doorTable(state, cfg).get(door)!, c0) / mapFactor(cfg, c0.pace, leading(c0), c0.bot, c0.bitten) + hallSeconds(state, cfg, cfg.hall.spots[door], 'food', c0.pace, leading(c0));
    const priced = [...HALL_DOORS].sort((a, b) => price(a) - price(b))[0];
    expect(priced, `priced ${HALL_DOORS.map((d) => `${d} ${price(d).toFixed(2)} s`).join(', ')}`).toBe('doorL');

    const walker = new FloorWalker(ME);
    let entered: string | null = null;
    // literal-ok: a bound on the walk round the store, many times what it takes
    for (let tick = 0; tick < 600 && entered === null; tick++) {
      const run = walker.run({ state, floor, cfg, secondsLeft: 40 }, { type: 'outfit', outfit: 'food' }, 0);
      expect(run.kind, JSON.stringify(run)).toBe('going');
      if (run.kind !== 'going') break;
      floor = stepFloor(floor, state, { [ME]: run.input }, cfg.steer.tickMs, cfg);
      if (me().space === 'hall') entered = placeAt(me(), cfg.hall);
    }
    expect(entered, 'the door it came in by').toBe('doorL');
  });
});
