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
  type FloorInput,
  type GameState,
} from '@mule/engine';
import { installable, placePoint } from '../src/floor-time.js';
import { simFloorConfig } from '../src/floor-turn.js';
import { FloorWalker, type StepRun } from '../src/hands/floor-walker.js';
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
 * then its press where Reach offers one; `between` may change the floor after each tick, and `stepped` the floor the
 * step left, before the press (as stepGlint lights a glint there). The other seats stand.
 */
function playTurn(
  state: GameState,
  cfg: FloorConfig,
  seat: AiSeat,
  between: (floor: DevFloor) => DevFloor = (f) => f,
  stepped: (floor: DevFloor, input: FloorInput, left: number) => DevFloor = (f) => f,
): DevFloor {
  let floor = buildFloor(state, cfg);
  const ticks = (DEVELOPMENT.fullSeconds * MS_PER_SECOND) / cfg.steer.tickMs;
  for (let run = 0; run + 1 < ticks && !state.players.find((p) => p.id === ME)!.doneDeveloping; run++) {
    const left = (DEVELOPMENT.fullSeconds * MS_PER_SECOND - (run + 1) * cfg.steer.tickMs) / MS_PER_SECOND;
    const inputs = { [ME]: seat.developSteer(state, floor, left, cfg) };
    const spent = doorPresses(floor, state, inputs, cfg);
    floor = stepped(settleMoments(state, stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg)), inputs[ME]!, left);
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

  it("FM-floor-lake-stand: no MULE is bought for a lake plot whose only shore off the seat's own land no walk reaches", () => {
    // Seed 14's map for four seats, as the sim's game 14 has it in month 2: ai0's lake plot at 12·8 (0-based) borders its
    // own swamps at 11·7 and 11·8, each with a MULE, where Reach works the swamp underfoot, not the lake; and the plains at
    // 13·7 and 13·8, which the lakes along column 12 and row 5 wall off from the store. No spot to install it from is
    // reachable, though the walk to the lake's edge across the swamps is.
    const state = development(14, 4);
    const at = (x: number, y: number) => tileAt(state.tiles, state.width, x, y)!;
    expect([at(12, 8), at(12, 5), at(13, 5), at(14, 5), at(12, 6), at(12, 7)].map((t) => t.terrain)).toEqual(Array(6).fill('lake'));
    at(12, 8).owner = ME;
    for (const t of [at(11, 7), at(11, 8)]) {
      t.owner = ME;
      t.outfit = 'water';
    }
    const cfg = quietConfig();
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    playTurn(state, cfg, seat);
    const me = state.players.find((p) => p.id === ME)!;
    const log = seat.developLog();
    // The promise: no MULE paid for and lost. Every MULE it buys it installs.
    expect(refused(seat), JSON.stringify(log)).toEqual([]);
    expect(me.carriedMule, 'no MULE on the lead').toBeNull();
    const ok = (type: string) => log.filter((e) => e.action.type === type && e.ok).length;
    expect(ok('install'), 'MULEs installed, of those bought').toBe(ok('buyMule'));
  });

  it('FM-floor-lake-stand: a lake plot whose only reachable shore is out of the right-hand door is installed from there, as planned', () => {
    // A test-local map: the store's column made lake splits the map, so the land out of the left door never reaches the
    // right half. ai0's lake plot two tiles right of the store has its whole shore on the right half.
    const state = development(4);
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    for (const t of state.tiles) {
      if (t.x === store.x && t !== store) t.terrain = 'lake';
      else if (t.x !== store.x && Math.abs(t.x - store.x) <= 4) t.terrain = 'plains';
    }
    const lake = tileAt(state.tiles, state.width, store.x + 2, store.y)!;
    lake.terrain = 'lake';
    lake.owner = ME;
    const cfg = quietConfig();
    const index = state.tiles.indexOf(lake);
    expect(installable(state, cfg, ME, index), 'the plan counts on a spot to install it from').toBe(true);
    // In the store at the corral, leading an Energy MULE.
    state.players.find((p) => p.id === ME)!.carriedMule = 'energy';
    const at = placePoint('corral', cfg.hall);
    const built = buildFloor(state, cfg);
    let floor: DevFloor = { ...built, colonists: built.colonists.map((c) => (c.id === ME ? { ...c, space: 'hall' as const, ...at, lead: { good: 'energy' as const, ...at } } : c)) };
    const walker = new FloorWalker(ME);
    const action = { type: 'install' as const, x: lake.x, y: lake.y };
    let run: StepRun = { kind: 'going', input: { x: 0, y: 0, act: false } };
    // literal-ok: a bound in ticks, many times the walk
    for (let i = 0; i < 2_000 && run.kind === 'going'; i++) {
      run = walker.run({ state, floor, cfg, secondsLeft: 40 }, action, 0);
      if (run.kind !== 'going') break;
      const inputs = { [ME]: run.input };
      const spent = doorPresses(floor, state, inputs, cfg);
      floor = settleMoments(state, stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg));
      if (run.input.act && !spent.has(ME)) floor = applyReach(state, floor, ME, 40, cfg).floor;
    }
    // The promise: the walk agrees with the plan, and the MULE is on its plot.
    expect(run).toEqual({ kind: 'ok' });
    expect(lake.outfit).toBe('energy');
  });
});

describe("the arcade floor's AI bugs of 5 Nov (FM-glint-install, FM-led-analyse, FM-floor-filter)", () => {
  it('FM-glint-install: a glint lit in reach as the install is pressed takes the press, and the hand presses again to install', () => {
    // Seen in FM-hurry-margin's sample with WS9's ownPhases on (game 11, month 2, ai3): the step that carried the install
    // press lit a glint within GRAB's reach, and GRAB THE GLINT ranks above INSTALL (RULE-3). The install did not take
    // and the hand led the MULE into the pub, where it was lost.
    const state = development(4);
    const plot = state.tiles.find((t) => t.terrain === 'plains' && t.owner === null)!;
    plot.owner = ME;
    const cfg = quietConfig();
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    const me = state.players.find((p) => p.id === ME)!;
    let crystite: number | null = null;
    playTurn(state, cfg, seat, undefined, (floor, input, left) => {
      if (crystite !== null || !input.act || reachOf(floor, state, ME, cfg, { secondsLeft: left }).kind !== 'install') return floor;
      const c = floor.colonists.find((x) => x.id === ME)!;
      const under = (t: { x: number; y: number }) => Math.floor(c.x) === t.x && Math.floor(c.y) === t.y;
      const beside = state.tiles.find((t) => t.terrain !== 'store' && terrainShare(t.terrain, cfg) > 0 && !under(t) && Math.hypot(t.x + 0.5 - c.x, t.y + 0.5 - c.y) <= cfg.glint.grabReach)!;
      crystite = me.stock.crystite;
      return { ...floor, moments: { ...floor.moments, glint: { x: beside.x, y: beside.y, sinceTick: floor.tick, untilTick: floor.tick + 3 } } };
    });
    expect(crystite, 'a glint lit as the install was pressed').not.toBeNull();
    expect(me.stock.crystite, 'the press grabbed the glint').toBeGreaterThan(crystite!);
    // The promise: the MULE it paid for is on its plot, not walked into the pub.
    expect(refused(seat), JSON.stringify(seat.developLog())).toEqual([]);
    expect(me.carriedMule, 'no MULE left on the lead').toBeNull();
    expect(tileAt(state.tiles, state.width, plot.x, plot.y)!.outfit, 'the MULE on its plot').not.toBeNull();
  });

  it('FM-led-analyse: a seat that starts development leading a lot MULE installs it first, and no analysis it sets off for is refused', () => {
    // A MULE won at the land auction is led into development (lots.ts: carriedMule = the lot's outfit). While it leads one,
    // a plot's button offers INSTALL, not ANALYSE, so analyses queued ahead of the install are refused on the plot.
    const state = development(4);
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    const near = state.tiles
      .filter((t) => t.owner === null && t.terrain !== 'lake' && t.terrain !== 'store' && !t.special)
      .sort((a, b) => Math.abs(a.x - store.x) + Math.abs(a.y - store.y) - (Math.abs(b.x - store.x) + Math.abs(b.y - store.y)));
    for (const t of near.slice(0, 4)) t.owner = ME;
    const me = state.players.find((p) => p.id === ME)!;
    me.carriedMule = 'food';
    const cfg = quietConfig();
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    playTurn(state, cfg, seat);
    const log = seat.developLog();
    const shown = JSON.stringify(log);
    expect(log.some((e) => e.action.type === 'analyse'), `it wanted an analysis: ${shown}`).toBe(true);
    // The promise: no walk to an analysis the button then refuses, and the MULE it was given is on a plot of its own.
    expect(log.filter((e) => e.action.type === 'analyse' && !e.ok && e.why !== 'no time'), shown).toEqual([]);
    const first = log[0]?.action;
    expect(first?.type === 'install' && log[0]!.ok, `the lot MULE installed first: ${shown}`).toBe(true);
    if (first?.type === 'install') expect(tileAt(state.tiles, state.width, first.x, first.y)!.outfit, 'the lot MULE on its plot').toBe('food');
  });

  it('FM-floor-filter: a filter for an own polluter not yet analysed is fitted, not refused at the plot', () => {
    // On an own plot not yet analysed Reach offers ANALYSE (row 10) before FIT FILTER (row 11), so a filter planned for
    // such a plot was walked to and refused there.
    const state = development(4);
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    const mine = state.tiles
      .filter((t) => t.owner === null && t.terrain !== 'lake' && t.terrain !== 'store' && !t.special)
      .sort((a, b) => Math.abs(a.x - store.x) + Math.abs(a.y - store.y) - (Math.abs(b.x - store.x) + Math.abs(b.y - store.y)))[2]!;
    Object.assign(mine, { owner: ME, outfit: 'rareEarth', runMonths: 2 });
    const me = state.players.find((p) => p.id === ME)!;
    expect(me.analysed.includes(state.tiles.indexOf(mine)), 'the plot not analysed').toBe(false);
    me.stock.alloy = 1;
    // The air near Smoggy: the strategist wants a filter on its Rare earth mine.
    state.air = 25;
    const cfg = quietConfig();
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    playTurn(state, cfg, seat);
    const log = seat.developLog();
    const shown = JSON.stringify(log);
    expect(log.some((e) => e.action.type === 'filter'), `it wanted a filter: ${shown}`).toBe(true);
    // The promise: the filter it walked to is on its plot.
    expect(log.filter((e) => e.action.type === 'filter' && !e.ok), shown).toEqual([]);
    expect(mine.filter, 'the filter on the mine').toBe(true);
  });
});
