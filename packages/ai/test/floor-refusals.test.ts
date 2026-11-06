import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  analysisSeconds,
  applyReach,
  buildFloor,
  createGame,
  DEVELOPMENT,
  doorPresses,
  MS_PER_SECOND,
  observe,
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
  type Outfit,
} from '@mule/engine';
import { installable, placePoint, plotErrandSeconds, pubMargin } from '../src/floor-time.js';
import { simFloorConfig } from '../src/floor-turn.js';
import { FloorWalker, type StepRun } from '../src/hands/floor-walker.js';
import { outlook } from '../src/outlook.js';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import { canFeed, installGain } from '../src/value.js';

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
 * step left, before the press (as stepGlint lights a glint there). The other seats stand. The turn is `seconds` long.
 */
function playTurn(
  state: GameState,
  cfg: FloorConfig,
  seat: AiSeat,
  between: (floor: DevFloor) => DevFloor = (f) => f,
  stepped: (floor: DevFloor, input: FloorInput, left: number) => DevFloor = (f) => f,
  seconds: number = DEVELOPMENT.fullSeconds,
): DevFloor {
  let floor = buildFloor(state, cfg);
  const ticks = (seconds * MS_PER_SECOND) / cfg.steer.tickMs;
  for (let run = 0; run + 1 < ticks && !state.players.find((p) => p.id === ME)!.doneDeveloping; run++) {
    const left = (seconds * MS_PER_SECOND - (run + 1) * cfg.steer.tickMs) / MS_PER_SECOND;
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

/** The free plots off lakes and specials, nearest the store first. */
function nearestFree(state: GameState) {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  return state.tiles
    .filter((t) => t.owner === null && t.terrain !== 'lake' && t.terrain !== 'store' && !t.special)
    .sort((a, b) => Math.abs(a.x - store.x) + Math.abs(a.y - store.y) - (Math.abs(b.x - store.x) + Math.abs(b.y - store.y)));
}

/** Gives ai0 the `n` free plots nearest the store, off lakes and specials, and returns them. */
function ownNearest(state: GameState, n: number) {
  const near = nearestFree(state).slice(0, n);
  for (const t of near) t.owner = ME;
  return near;
}

/** What installGain says a MULE of `outfit` gains on each of ai0's idle plots, by tile index, as the seat sees it now. */
function idleGains(state: GameState, seat: AiSeat, outfit: Outfit): Map<number, number> {
  const obs = observe(state, ME);
  const o = outlook(obs, ME, { lookAhead: seat.mind.level.lookAhead });
  return new Map(obs.tiles.filter((t) => t.owner === ME && !t.outfit).map((t) => [obs.tiles.indexOf(t), installGain(obs, o, t, outfit, seat.mind).gain]));
}

/** The index the gains rank first. */
const bestOf = (gains: Map<number, number>) => [...gains].sort((a, b) => b[1] - a[1])[0]![0];

/** The steps today's hand gives up before pressing them, by why: the clock, the scramble's race, the hurry to the pub. */
const HAND_DROPS = new Set(['no time', 'scramble', 'hurry', 'hurry after a pack']);

/**
 * The MULE steps the floor refused: an outfit or an install pressed and not taken. Today's hand logs a press refused
 * with no outcome, a route with 'refused'. A step the hand dropped before pressing it (HAND_DROPS), or a route step it
 * replaced, skipped or never reached, was not pressed.
 */
const refused = (seat: AiSeat) =>
  seat
    .developLog()
    .filter((e) => !e.ok && (e.outcome === 'refused' || (e.outcome === undefined && !HAND_DROPS.has(e.why ?? ''))) && (e.action.type === 'outfit' || e.action.type === 'install'));

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
    ownNearest(state, 4);
    const me = state.players.find((p) => p.id === ME)!;
    me.carriedMule = 'food';
    const cfg = quietConfig();
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    const gains = idleGains(state, seat, 'food');
    const best = state.tiles[bestOf(gains)]!;
    expect(Math.min(...gains.values()), 'the plots differ for a Food MULE').toBeLessThan(gains.get(state.tiles.indexOf(best))!);
    playTurn(state, cfg, seat);
    const log = seat.developLog();
    const shown = JSON.stringify(log);
    expect(log.some((e) => e.action.type === 'analyse'), `it wanted an analysis: ${shown}`).toBe(true);
    // The promise: no walk to an analysis the button then refuses, and the MULE it was given is on the plot it gains most
    // on, installed first. That plot, developed, is not walked back to for an analysis.
    expect(log.filter((e) => e.action.type === 'analyse' && !e.ok && e.why !== 'no time'), shown).toEqual([]);
    expect(log[0], `the lot MULE installed first: ${shown}`).toMatchObject({ ok: true, action: { type: 'install', x: best.x, y: best.y } });
    expect(best.outfit, 'the lot MULE on its best plot').toBe('food');
    expect(log.filter((e) => e.action.type === 'analyse' && e.action.x === best.x && e.action.y === best.y), shown).toEqual([]);
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

  it('FM-floor-filter: a filter whose analysis the clock drops is dropped with it, never walked to', () => {
    // The turn is cut so the walk to the mine and back to the pub fits the clock with the analysis's assay left out, and
    // not with it: the analysis is dropped for time. ANALYSE still outranks FIT FILTER on the plot, so the filter alone
    // would be walked to and refused there.
    const state = development(4);
    const mine = nearestFree(state)[2]!;
    Object.assign(mine, { owner: ME, outfit: 'rareEarth', runMonths: 2 });
    const me = state.players.find((p) => p.id === ME)!;
    me.stock.alloy = 1;
    state.air = 25;
    const cfg = quietConfig();
    const c = buildFloor(state, cfg).colonists.find((x) => x.id === ME)!;
    const index = state.tiles.indexOf(mine);
    const errand = (work: number) => plotErrandSeconds(state, cfg, c, index, work) + pubMargin(cfg, c);
    // Halfway between the two, and the ticks the hand spends deciding before it sets off.
    const seconds = (errand(0) + errand(analysisSeconds(state, ME))) / 2 + (3 * cfg.steer.tickMs) / MS_PER_SECOND; // literal-ok: the start, the decision and the first step's tick
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    playTurn(state, cfg, seat, undefined, undefined, seconds);
    const log = seat.developLog();
    const shown = JSON.stringify(log);
    expect(log.filter((e) => e.action.type === 'analyse').map((e) => e.why), `the analysis dropped for time: ${shown}`).toEqual(['no time']);
    // The promise: no walk to a filter the plot then refuses; the turn ends at the pub.
    expect(log.filter((e) => e.action.type === 'filter'), shown).toEqual([]);
    expect(me.doneDeveloping, 'at the pub').toBe(true);
  });

  it("FM-glint-install: a press that did not take is pressed again only for this seat's own glint, not another seat's", () => {
    // The walker reads a press that did not take as GRAB THE GLINT's only when the tick's glint beat is this seat's.
    const state = development(4);
    const plot = state.tiles.find((t) => t.terrain === 'plains' && t.owner === null)!;
    plot.owner = ME;
    state.players.find((p) => p.id === ME)!.carriedMule = 'energy';
    const cfg = quietConfig();
    const action = { type: 'install' as const, x: plot.x, y: plot.y };
    const run = (who: string) => {
      const built = buildFloor(state, cfg);
      // Standing on the plot, leading the MULE: Reach offers INSTALL there.
      let floor: DevFloor = { ...built, colonists: built.colonists.map((c) => (c.id === ME ? { ...c, space: 'map' as const, x: plot.x + 0.5, y: plot.y + 0.5, lead: { good: 'energy' as const, x: plot.x + 0.5, y: plot.y + 0.5 } } : c)) };
      expect(reachOf(floor, state, ME, cfg, { secondsLeft: 40 }).kind, 'INSTALL offered').toBe('install');
      const walker = new FloorWalker(ME);
      let out: StepRun = walker.run({ state, floor, cfg, secondsLeft: 40 }, action, 0);
      // literal-ok: a bound in ticks, many times a counter's pause
      for (let i = 0; i < 200 && out.kind === 'going' && !out.input.act; i++) out = walker.run({ state, floor, cfg, secondsLeft: 40 }, action, 0);
      expect(out, 'it pressed INSTALL').toMatchObject({ kind: 'going', input: { act: true } });
      // The press is not applied, and the tick's beats hold a glint won by `who`.
      floor = { ...floor, moments: { ...floor.moments, beats: [{ kind: 'glint', who, text: 'a glint won' }] } };
      return walker.run({ state, floor, cfg, secondsLeft: 40 }, action, 0);
    };
    expect(run('ai1'), "another seat's glint: the press failed").toEqual({ kind: 'failed', why: 'the press did not take' });
    expect(run(ME), 'its own glint: it presses again').toMatchObject({ kind: 'going' });
  });
});

describe('a MULE led into development is never lost to the lead (FM-led-no-gain)', () => {
  it("FM-led-no-gain: a led Medicine MULE with nothing to feed it is installed on the seat's best idle plot, not lost at the pub", () => {
    // Review of 5 Nov: with no gain to be had (a factory it can't feed, or no plot it earns on), nothing was planned for
    // the led MULE. While it is led INSTALL outranks ANALYSE and FIT FILTER on every own plot and the corral offers no BUY,
    // so the seat lost its turn and the MULE ran off at the pub. It is paid for, and on the floor a MULE taken off a plot
    // can be re-outfitted next month (Reach row 8a).
    const state = development(4);
    ownNearest(state, 4);
    const me = state.players.find((p) => p.id === ME)!;
    me.carriedMule = 'medicine';
    me.stock.food = 0;
    me.stock.water = 0;
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    expect(canFeed(observe(state, ME), ME, 'medicine'), 'nothing to feed it').toBe(false);
    const best = bestOf(idleGains(state, seat, 'medicine'));
    playTurn(state, quietConfig(), seat);
    const log = seat.developLog();
    const shown = JSON.stringify(log);
    // The promise: the MULE it was given is on the plot it gains most on, and no step the lead made impossible was walked.
    expect(me.carriedMule, `no MULE left on the lead: ${shown}`).toBeNull();
    expect(state.tiles[best]!.outfit, `the Medicine MULE on its best idle plot: ${shown}`).toBe('medicine');
    expect(log.filter((e) => !e.ok), shown).toEqual([]);
  });

  it('FM-led-no-gain: with no idle plot, a seat leading a MULE walks to no plot or counter the lead closes, and goes to the pub', () => {
    // Every own plot has a MULE, so there is nowhere to install it without driving one off. INSTALL outranks ANALYSE and
    // FIT FILTER on every own plot, so the filter the air calls for (and its analysis) can't be had while it leads.
    const state = development(4);
    const [mine] = ownNearest(state, 1);
    Object.assign(mine!, { outfit: 'rareEarth', runMonths: 2 });
    const me = state.players.find((p) => p.id === ME)!;
    me.stock.alloy = 1;
    state.air = 25;
    me.carriedMule = 'food';
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    playTurn(state, quietConfig(), seat);
    const log = seat.developLog();
    // The promise: no walk the lead wastes; the turn ends at the pub (its press is the turn's last, never logged), the
    // mine's MULE where it was.
    expect(log.map((e) => [e.action.type, e.ok])).toEqual([]);
    expect(me.doneDeveloping, 'at the pub').toBe(true);
    expect(mine!.outfit).toBe('rareEarth');
  });

  it('FM-led-no-gain: off the floor too, a seat that starts development leading a lot MULE installs it', () => {
    // The tap path: buyMule refuses a seat already leading a MULE, so a lot MULE never installed ran off at the pub.
    const state = development(4);
    ownNearest(state, 4);
    const me = state.players.find((p) => p.id === ME)!;
    me.carriedMule = 'food';
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    const best = bestOf(idleGains(state, seat, 'food'));
    const tick = 100;
    for (let ms = 0; ms < DEVELOPMENT.fullSeconds * MS_PER_SECOND && !me.doneDeveloping; ms += tick) {
      seat.developTick(state, tick, DEVELOPMENT.fullSeconds - ms / MS_PER_SECOND, (a) => applyAction(state, ME, a));
    }
    const shown = JSON.stringify(seat.developLog());
    expect(me.doneDeveloping, `it went to the pub: ${shown}`).toBe(true);
    expect(state.tiles[best]!.outfit, `the lot MULE on its best idle plot: ${shown}`).toBe('food');
  });

  it('FM-led-no-gain: a led MULE goes on the best idle plot it can be installed on, not a lake plot no walk reaches a shore of', () => {
    // Seen in the walking-on sim (seed 101, game 9, ai2): the led Food MULE's best plot was a lake plot with nowhere to
    // stand for it, the install was refused, and the seat walked to the corral for a MULE it could not buy. Seed 14's
    // map for four seats: ai0's lake plot at 12·8 has no reachable shore off its own land (as FM-floor-lake-stand).
    const state = development(14, 4);
    const at = (x: number, y: number) => tileAt(state.tiles, state.width, x, y)!;
    at(12, 8).owner = ME;
    for (const t of [at(11, 7), at(11, 8)]) Object.assign(t, { owner: ME, outfit: 'water' });
    const cfg = quietConfig();
    const lake = state.tiles.indexOf(at(12, 8));
    expect(installable(state, cfg, ME, lake), 'nowhere to stand for the lake plot').toBe(false);
    const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 });
    // A reachable idle plot that a Food MULE gains less on than the lake plot.
    const [dry] = nearestFree(state).filter((t) => terrainShare(t.terrain, cfg) > 0);
    dry!.owner = ME;
    const gains = idleGains(state, seat, 'food');
    expect(bestOf(gains), 'the lake plot ranks first by installGain').toBe(lake);
    const me = state.players.find((p) => p.id === ME)!;
    me.carriedMule = 'food';
    playTurn(state, cfg, seat);
    const log = seat.developLog();
    const shown = JSON.stringify(log);
    // The promise: the MULE it was given is on a plot of its own, and no step was walked to and refused.
    expect(me.carriedMule, `no MULE left on the lead: ${shown}`).toBeNull();
    expect(dry!.outfit, `the lot MULE on the plot it can reach: ${shown}`).toBe('food');
    expect(log.filter((e) => !e.ok), shown).toEqual([]);
  });
});
