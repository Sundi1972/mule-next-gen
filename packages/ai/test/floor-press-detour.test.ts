import { describe, expect, it } from 'vitest';
import { advancePhase, applyReach, buildFloor, createGame, doorPresses, MS_PER_SECOND, player, reachOf, settleMoments, stepFloor, type DevFloor, type FloorConfig, type FloorInput } from '@mule/engine';
import { simFloorConfig } from '../src/floor-turn.js';
import { AiSeat } from '../src/seat.js';

const ME = 'ai0';

describe('a moment never takes the hand off a press it has not read yet (FM-hurry-margin)', () => {
  it('FM-hurry-margin: a glint lit the tick after the MULE is bought is raced with the MULE counted bought, not bought again', () => {
    // Game 7 of T-AC-5's sim sample, month 3, ai0: a glint race started the tick after its BUY took, before its hand read
    // the press. Back from the race the hand walked the buy again, the corral offered nothing to a colonist already
    // leading a MULE, and the hand dropped the MULE's outfit and install and led it into the pub.
    const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    // A plains plot of its own to put the MULE on, as heldDoors gives it (floor-walker-stuck.test.ts).
    for (const t of state.tiles) if (t.owner === ME) t.owner = null;
    state.tiles.find((t) => t.terrain === 'plains' && t.owner === null)!.owner = ME;
    const live = simFloorConfig();
    // Every bot races every glint it can (test-local: the race has to happen for the case to mean anything).
    const cfg: FloorConfig = { ...live, glint: { ...live.glint, botShare: 1 } };
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    let floor: DevFloor = buildFloor(state, cfg);
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    // The glint lights on the open tile beside the store's right door: near, and worth the race.
    const lit = state.tiles.find((t) => t.x === store.x + 1 && t.y === store.y)!;
    let lightAt: number | null = null;
    const tickSeconds = cfg.steer.tickMs / MS_PER_SECOND;
    // literal-ok: a bound in ticks, under the clock's
    for (let tick = 0; tick < 500; tick++) {
      const left = 50 - tick * tickSeconds; // literal-ok: seconds on the clock, enough for a MULE and the race
      const input: FloorInput = seat.developSteer(state, floor, left, cfg);
      const spent = doorPresses(floor, state, { [ME]: input }, cfg);
      floor = settleMoments(state, stepFloor(floor, state, { [ME]: input }, cfg.steer.tickMs, cfg));
      if (input.act && !spent.has(ME) && reachOf(floor, state, ME, cfg, { secondsLeft: left }).enabled) {
        const bought = player(state, ME).carriedMule;
        floor = applyReach(state, floor, ME, left, cfg).floor;
        if (bought === null && player(state, ME).carriedMule !== null) lightAt = floor.tick;
      }
      if (lightAt === floor.tick) floor = { ...floor, moments: { ...floor.moments, glint: { x: lit.x, y: lit.y, sinceTick: floor.tick, untilTick: floor.tick + 1_000 } } }; // literal-ok: lit for the rest of the case
      if (player(state, ME).doneDeveloping) break;
    }
    const log = seat.developLog();
    expect(lightAt, 'it bought a MULE').not.toBeNull();
    expect(log.filter((s) => s.action.type === 'buyMule').map((s) => [s.ok, s.why ?? null]), JSON.stringify(log)).toEqual([[true, null]]);
  });
});
