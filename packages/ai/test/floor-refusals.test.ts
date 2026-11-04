import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  applyReach,
  buildFloor,
  createGame,
  DEVELOPMENT,
  doorPresses,
  MS_PER_SECOND,
  reachOf,
  RuleError,
  settleMoments,
  stepFloor,
  terrainShare,
  tileAt,
  type DevFloor,
  type FloorConfig,
  type GameState,
} from '@mule/engine';
import { simFloorConfig } from '../src/floor-turn.js';
import { AiSeat } from '../src/seat.js';

const ME = 'ai0';

/** The sim's floor config with no moments of its own: no wolves, no scramble, no glint lit by the floor's roll. */
function quietConfig(): FloorConfig {
  const live = simFloorConfig();
  return {
    ...live,
    wolves: { ...live.wolves, on: false },
    scramble: { ...live.scramble, on: false },
    // A glint the test lights is raced by the AI whenever it can be (botShare 1, any distance).
    glint: { ...live.glint, on: false, botShare: 1, botCareTiles: Number.POSITIVE_INFINITY },
  };
}

/** Month 1's development for `seats` AI seats, ai0's land cleared for the test to give. */
function development(seed: number, seats = 2): GameState {
  const state = createGame({ seed, players: Array.from({ length: seats }, (_, i) => i).map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner === ME) t.owner = null;
  return state;
}

/**
 * ai0's development turn on the floor, as the sim's referee plays it (floor-turn.ts): its input, the step, the moments,
 * then its press where Reach offers one; `between` may change the floor after each tick. The other seats stand.
 */
function playTurn(state: GameState, cfg: FloorConfig, seat: AiSeat, between: (floor: DevFloor) => DevFloor = (f) => f): DevFloor {
  let floor = buildFloor(state, cfg);
  const ticks = (DEVELOPMENT.fullSeconds * MS_PER_SECOND) / cfg.steer.tickMs;
  for (let run = 0; run + 1 < ticks && !state.players.find((p) => p.id === ME)!.doneDeveloping; run++) {
    const left = (DEVELOPMENT.fullSeconds * MS_PER_SECOND - (run + 1) * cfg.steer.tickMs) / MS_PER_SECOND;
    const inputs = { [ME]: seat.developSteer(state, floor, left, cfg) };
    const spent = doorPresses(floor, state, inputs, cfg);
    floor = settleMoments(state, stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg));
    if (inputs[ME]!.act && !spent.has(ME) && reachOf(floor, state, ME, cfg, { secondsLeft: left }).enabled) {
      try {
        floor = applyReach(state, floor, ME, left, cfg).floor;
      } catch (err) {
        if (!(err instanceof RuleError)) throw err;
      }
    }
    floor = between(floor);
  }
  return floor;
}

/** The MULE steps the hand gave up on the floor: an outfit or an install the button did not offer. */
const refused = (seat: AiSeat) => seat.developLog().filter((e) => !e.ok && (e.action.type === 'outfit' || e.action.type === 'install'));

describe('the floor never refuses a MULE step the AI planned (FM-floor-refusals)', () => {
  it('FM-floor-outfit-offer: a MULE outfitted just before a glint detour is installed, not dropped at its outfitter', () => {
    const state = development(4);
    const plot = state.tiles.find((t) => t.terrain === 'plains' && t.owner === null)!;
    plot.owner = ME;
    const cfg = quietConfig();
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    // The tick its outfit press takes, a glint lights a few tiles off: the AI races it, and it fades before the race is run.
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    const glintAt = state.tiles.find((t) => t.owner === null && t.terrain !== 'store' && terrainShare(t.terrain, cfg) > 0 && Math.abs(t.x - store.x) + Math.abs(t.y - store.y) === 2)!;
    let lit = false;
    playTurn(state, cfg, seat, (floor) => {
      const carried = state.players.find((p) => p.id === ME)!.carriedMule;
      if (lit || !carried || carried === 'empty') return floor;
      lit = true;
      return { ...floor, moments: { ...floor.moments, glint: { x: glintAt.x, y: glintAt.y, sinceTick: floor.tick, untilTick: floor.tick + 3 } } };
    });
    expect(lit, 'the AI outfitted a MULE').toBe(true);
    const me = state.players.find((p) => p.id === ME)!;
    // The promise: the MULE it paid for is on its plot, not left on its lead or walked into the pub.
    expect(refused(seat), JSON.stringify(seat.developLog())).toEqual([]);
    expect(me.carriedMule, 'no MULE left on the lead').toBeNull();
    expect(tileAt(state.tiles, state.width, plot.x, plot.y)!.outfit, 'the MULE on its plot').not.toBeNull();
  });
});
