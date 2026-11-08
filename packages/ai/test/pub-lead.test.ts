import { describe, expect, it } from 'vitest';
import { advancePhase, applyReach, buildFloor, createGame, doorPresses, MS_PER_SECOND, player, reachOf, settleMoments, stepFloor, terrainShare, type DevFloor, type FloorConfig, type FloorInput } from '@mule/engine';
import { simFloorConfig } from '../src/floor-turn.js';
import { AiSeat } from '../src/seat.js';

const ME = 'ai0';

/** How one development turn went for ai0, started with `clock` seconds on it. */
interface Turn {
  clock: number;
  bought: number;
  installs: number;
  /** The seconds left when it first set off racing the glint with the MULE on its lead; null if it never did. */
  raceAt: number | null;
  /** Where the turn ended: PUB pressed, or the clock run out. */
  ended: 'PUB' | 'the clock ran out';
}

/**
 * One development turn of ai0 on the floor, refereed as floor-turn.ts does, with `clock` seconds on it from the first tick.
 * Seed 4's two-seat game: ai0 a Zipwing with no Food, whose household ate nothing at the last month end (hungry: 0.6 of its
 * pace; needs C15), one plains plot of its own to put a MULE on.
 * The tick its BUY takes, a glint lights two tiles above the store and stays lit for the rest of the turn, and it races
 * every glint it can (GLINT.botShare 1, test-local). No wolves, so no pack meets it and nothing excuses a MULE lost.
 */
function turn(clockTicks: number): Turn & { pace: number; litOpen: boolean } {
  const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner === ME) t.owner = null;
  state.tiles.find((t) => t.terrain === 'plains' && t.owner === null)!.owner = ME;
  player(state, ME).stock.food = 0;
  player(state, ME).householdShort = 1;
  const live = simFloorConfig();
  const cfg: FloorConfig = { ...live, wolves: { ...live.wolves, on: false }, glint: { ...live.glint, on: false, botShare: 1 } };
  const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
  let floor: DevFloor = buildFloor(state, cfg);
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const lit = state.tiles.find((t) => t.x === store.x && t.y === store.y - 2)!; // literal-ok: two tiles above the store
  const clock = (clockTicks * cfg.steer.tickMs) / MS_PER_SECOND;
  const out: Turn = { clock, bought: 0, installs: 0, raceAt: null, ended: 'the clock ran out' };
  // Whole ticks, so the clock never drifts in floating point.
  for (let tick = 1; tick < clockTicks; tick++) {
    const left = ((clockTicks - tick) * cfg.steer.tickMs) / MS_PER_SECOND;
    const input: FloorInput = seat.developSteer(state, floor, left, cfg);
    const spent = doorPresses(floor, state, { [ME]: input }, cfg);
    floor = settleMoments(state, stepFloor(floor, state, { [ME]: input }, cfg.steer.tickMs, cfg));
    if (out.raceAt === null && seat.developRacing() !== null && player(state, ME).carriedMule !== null) out.raceAt = left;
    if (input.act && !spent.has(ME) && reachOf(floor, state, ME, cfg, { secondsLeft: left }).enabled) {
      const press = applyReach(state, floor, ME, left, cfg);
      floor = press.floor;
      if (press.reach.kind === 'buy') {
        out.bought++;
        floor = { ...floor, moments: { ...floor.moments, glint: { x: lit.x, y: lit.y, sinceTick: floor.tick, untilTick: floor.tick + 100_000 } } }; // literal-ok: lit for the rest of the turn
      }
      if (press.reach.kind === 'install') out.installs++;
      if (press.reach.kind === 'pub') out.ended = 'PUB';
    }
    if (player(state, ME).doneDeveloping) break;
  }
  const pace = floor.colonists.find((c) => c.id === ME)!.pace;
  return { ...out, pace, litOpen: lit.terrain !== 'store' && terrainShare(lit.terrain, cfg) > 0 };
}

describe('FM-pub-lead: a MULE bought is never left on the lead, at the pub or when the clock runs out', () => {
  it('FM-pub-lead: a hungry colonist leading a MULE it just bought, a glint lit near the store, at every clock from 27.8 s to 31 s: the MULE is installed, raced for or not', () => {
    // WS3's report, seed 8 month 7 (7ecb7d59): a hungry colonist leading its second MULE set off for a glint with 0.05 s
    // to spare. Its estimate rose 0.2 s at the store's door, the race was given up there, far from the outfit counter,
    // and the hurry for the pub then dropped the install: the MULE was walked into the pub on its lead. A race now
    // starts only with the slack a MULE is bought with (DEV_STEER.botPlanSlackShare); the check while racing keeps none.
    // The clocks step two ticks at a time across the edge where a race at the buy starts to fit, so the knife edge,
    // wherever the AI's estimates put it, falls inside them.
    const tickMs = simFloorConfig().steer.tickMs;
    const from = Math.round((27.8 * MS_PER_SECOND) / tickMs); // literal-ok: seconds on the clock, the fewest a MULE is bought with
    const to = Math.round((31 * MS_PER_SECOND) / tickMs); // literal-ok: seconds on the clock, enough for one
    const turns: ReturnType<typeof turn>[] = [];
    for (let ticks = from; ticks <= to; ticks += 2) turns.push(turn(ticks)); // literal-ok: two ticks a clock

    // The case: hungry and slow, the glint on open land; every clock buys the MULE, and in the window the colonist
    // races the glint with the MULE on its lead.
    expect(turns[0]!.pace, 'the case: a hungry colonist, slower than full pace').toBeLessThan(1);
    expect(turns[0]!.litOpen, 'the case: the glint lights on open land').toBe(true);
    expect(turns.filter((t) => t.bought === 0).map((t) => t.clock), 'the case: clocks where no MULE was bought').toEqual([]);
    expect(turns.some((t) => t.raceAt !== null), 'the case: a race set off for with the MULE on its lead').toBe(true);

    // The promise: every MULE bought is installed. No pack meets it (no wolves), so nothing excuses one lost.
    const lost = turns
      .filter((t) => t.installs < t.bought)
      .map((t) => `clock ${t.clock} s: bought ${t.bought}, installed ${t.installs}, ${t.raceAt === null ? 'no race' : `raced from ${t.raceAt} s left`}, ${t.ended}`);
    expect(lost, 'MULEs bought and left on the lead').toEqual([]);
  });
});
