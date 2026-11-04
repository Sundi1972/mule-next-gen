import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_HANDS,
  applyReach,
  buildFloor,
  createGame,
  createRng,
  DEV_STEER,
  DEVELOPMENT,
  doorPresses,
  MS_PER_SECOND,
  mulePriceFor,
  reachOf,
  RuleError,
  settleMoments,
  stepFloor,
  tileIndex,
  type DevelopmentPlay,
  type DevFloor,
  type FloorConfig,
  type GameState,
  type Tile,
} from '@mule/engine';
import { simFloorConfig } from '../src/floor-turn.js';
import { DevelopHand, type RoutePlay } from '../src/hands/develop.js';
import { applyAction, arrive, type DevClock } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

const ME = 'ai0';
const RIVAL = 'ai1';
const SEED = 11;

/** The sim's floor config with no moments of its own: no wolves, no glint; a scramble the test calls is raced. */
function quietConfig(): FloorConfig {
  const live = simFloorConfig();
  return {
    ...live,
    wolves: { ...live.wolves, on: false },
    scramble: { ...live.scramble, on: false, botShare: 1, botCareTiles: Number.POSITIVE_INFINITY },
    glint: { ...live.glint, on: false },
  };
}

/** Month 1's development for two AI seats, ai0's land cleared, and `n` free plains plots nearest the store. */
function development(n: number): { state: GameState; plots: Tile[] } {
  const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner === ME) t.owner = null;
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const far = (t: Tile) => Math.abs(t.x - store.x) + Math.abs(t.y - store.y);
  const plots = state.tiles.filter((t) => t.terrain === 'plains' && t.owner === null).sort((a, b) => far(a) - far(b)).slice(0, n);
  return { state, plots };
}

const indexOf = (state: GameState, t: Tile) => tileIndex(state.width, t.x, t.y);
const me = (state: GameState) => state.players.find((p) => p.id === ME)!;

function seatAndHand(): { seat: AiSeat; hand: DevelopHand } {
  const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: SEED });
  return { seat, hand: new DevelopHand(seat.brain, createRng(SEED)) };
}

/** A route of the test's own, played with the draft's seed and no money-maker. */
const routeOf = (route: DevelopmentPlay['route'], extra: Partial<DevelopmentPlay> = {}): RoutePlay => ({
  part: { route, timeBudgetMs: DEVELOPMENT.fullSeconds * MS_PER_SECOND, ifSoldOut: 'pub', ...extra },
  seed: SEED,
  moneyMaker: null,
});

/** The seat's own validated development draft, as a hand is given it. */
function drafted(seat: AiSeat, state: GameState): RoutePlay {
  const pb = seat.draft(state, 'development');
  return { part: pb.development!, seed: SEED, moneyMaker: pb.strategy.moneyMaker };
}

type Runner = 'tick' | 'steer';

interface TurnHooks {
  /** The floor after each tick, as the test changes it (steer only). */
  between?: (floor: DevFloor, run: number) => DevFloor;
  /** The seconds left as tick `run` ends, from the clock's own (steer only). */
  leftOf?: (run: number, left: number) => number;
}

/** ai0's development turn under DEV_WALK's tap-to-walk, as play.ts's loop runs it (DEV_STEER.on false). */
function tapTurn(state: GameState, hand: DevelopHand): void {
  const dt = AI_HANDS.devTickMs;
  const clock: DevClock = { left: me(state).devSeconds, at: 'store' };
  while (clock.left > 0 && !me(state).doneDeveloping) {
    arrive(state, ME, clock);
    hand.tick(state, dt, clock.left, (a) => applyAction(state, ME, a, clock), { at: clock.at!, busy: !!clock.busy });
    clock.left -= dt / MS_PER_SECOND;
  }
  const then = clock.busy?.then;
  if (then && (then.type === 'pub' || clock.busy!.until >= 0)) applyAction(state, ME, then, { left: Math.max(0, clock.left) });
}

/** ai0's development turn on the arcade floor, as floor-turn.ts's referee plays it (DEV_STEER.on): steer, step, press. */
function floorTurn(state: GameState, hand: DevelopHand, hooks: TurnHooks = {}): void {
  const cfg = quietConfig();
  let floor = buildFloor(state, cfg);
  const ticks = (DEVELOPMENT.fullSeconds * MS_PER_SECOND) / cfg.steer.tickMs;
  for (let run = 0; run + 1 < ticks && !me(state).doneDeveloping; run++) {
    const clock = (DEVELOPMENT.fullSeconds * MS_PER_SECOND - (run + 1) * cfg.steer.tickMs) / MS_PER_SECOND;
    const left = hooks.leftOf?.(run, clock) ?? clock;
    if (left <= 0) break;
    const inputs = { [ME]: hand.steer(state, floor, left, cfg) };
    const spent = doorPresses(floor, state, inputs, cfg);
    floor = settleMoments(state, stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg));
    if (inputs[ME]!.act && !spent.has(ME) && reachOf(floor, state, ME, cfg, { secondsLeft: left }).enabled) {
      try {
        floor = applyReach(state, floor, ME, left, cfg).floor;
      } catch (err) {
        if (!(err instanceof RuleError)) throw err;
      }
    }
    floor = hooks.between?.(floor, run) ?? floor;
  }
}

function play(runner: Runner, state: GameState, hand: DevelopHand, hooks?: TurnHooks): void {
  if (runner === 'tick') tapTurn(state, hand);
  else floorTurn(state, hand, hooks);
}

/** The route steps' outcomes, by route index; off-route entries apart. */
const byIndex = (hand: DevelopHand) => new Map(hand.routeLog().steps.filter((s) => s.route !== undefined).map((s) => [s.route!, s]));
const offRoute = (hand: DevelopHand) => hand.routeLog().steps.filter((s) => s.route === undefined);

let steer = DEV_STEER.on;
beforeEach(() => {
  steer = DEV_STEER.on;
});
afterEach(() => {
  DEV_STEER.on = steer;
});

describe("T-AC-7: RULE-9's rows, with their examples", () => {
  describe.each<Runner>(['tick', 'steer'])('under %s', (runner) => {
    beforeEach(() => {
      DEV_STEER.on = runner === 'steer';
    });

    it("T-AC-7 example 1 (rows 7, 8): the draft's route on an unchanged state plays every step done, with no notes", () => {
      const { state, plots } = development(2);
      for (const t of plots) t.owner = ME;
      const { seat, hand } = seatAndHand();
      const money = me(state).money;
      hand.follow(state.month, drafted(seat, state));
      play(runner, state, hand);
      const { steps, usedMs } = hand.routeLog();
      const log = JSON.stringify(hand.done);
      expect(steps.length, log).toBeGreaterThan(0);
      expect(steps.every((s) => s.outcome === 'done' && s.note === undefined && s.route !== undefined), log).toBe(true);
      expect(steps.map((s) => s.route), 'in route order, none missed').toEqual(steps.map((_, i) => i));
      // The promise: the MULEs it drafted stand on its plots, paid for, and it went to the pub.
      const installed = hand.done.filter((e) => e.action.type === 'install').length;
      expect(installed, log).toBeGreaterThan(0);
      expect(plots.filter((t) => t.outfit !== null).length).toBe(installed);
      expect(me(state).money).not.toBe(money);
      expect(me(state).doneDeveloping).toBe(true);
      expect(usedMs).toBeGreaterThan(0);
    });

    it('T-AC-7 row 1: done developing, the route plays nothing', () => {
      const { state, plots } = development(1);
      plots[0]!.owner = ME;
      me(state).doneDeveloping = true;
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: indexOf(state, plots[0]!) }, { act: 'pub' }]));
      play(runner, state, hand);
      expect(hand.routeLog().steps).toEqual([]);
      expect(me(state).analysed).toEqual([]);
    });

    it("T-AC-7 row 2: past timeBudgetMs, the steps left skip to the pub, 'time budget'", () => {
      const { state, plots } = development(2);
      const [a, b] = plots.map((t) => indexOf(state, t));
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a! }, { act: 'analyse', plot: b! }, { act: 'pub' }], { timeBudgetMs: 1 }));
      play(runner, state, hand);
      const steps = byIndex(hand);
      expect(steps.get(0)).toEqual({ route: 0, outcome: 'done' });
      expect(steps.get(1)).toEqual({ route: 1, outcome: 'skipped', note: 'time budget' });
      expect(steps.get(2)).toEqual({ route: 2, outcome: 'done' });
      expect(me(state).analysed).toEqual([a]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it.each(['sold', 'built on'])("T-AC-7 row 3 (example 2): its plot %s since the draft, that MULE is replaced by its own pick, 'stale'", (how) => {
      const { state, plots } = development(2);
      const [drafted0, spare] = plots as [Tile, Tile];
      drafted0.owner = ME;
      const { seat, hand } = seatAndHand();
      const play0 = drafted(seat, state);
      // After the draft: the plot goes to a rival at the land auction, or gets a MULE; the seat holds another idle plot.
      if (how === 'sold') drafted0.owner = RIVAL;
      else drafted0.outfit = 'food';
      spare.owner = ME;
      hand.follow(state.month, play0);
      play(runner, state, hand);
      const plot = indexOf(state, drafted0);
      const stale = hand.routeLog().steps.filter((s) => s.note === `stale: plot ${plot}`);
      expect(stale.length, JSON.stringify(hand.done)).toBe(3);
      expect(stale.every((s) => s.outcome === 'replaced')).toBe(true);
      // The promise: the MULE went onto the plot it does hold, idle, and none onto the stale one.
      expect(spare.outfit, JSON.stringify(hand.done)).not.toBeNull();
      expect(drafted0.outfit).toBe(how === 'sold' ? null : 'food');
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 row 4: an analysis of a plot it already analysed is skipped, 'already analysed'", () => {
      const { state, plots } = development(2);
      const [a, b] = plots.map((t) => indexOf(state, t));
      me(state).analysed.push(a!);
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a! }, { act: 'analyse', plot: b! }, { act: 'pub' }]));
      play(runner, state, hand);
      const steps = byIndex(hand);
      expect(steps.get(0)).toEqual({ route: 0, outcome: 'skipped', note: 'already analysed' });
      expect(steps.get(1)).toEqual({ route: 1, outcome: 'done' });
      expect(steps.get(2)).toEqual({ route: 2, outcome: 'done' });
      expect(me(state).analysed).toEqual([a, b]);
    });

    /** Two MULEs, a filter and the pub, with the corral empty and Alloy for the filter. */
    function soldOut(ifSoldOut: DevelopmentPlay['ifSoldOut']) {
      const { state, plots } = development(3);
      for (const t of plots) t.owner = ME;
      const [a, b, c] = plots.map((t) => indexOf(state, t)) as [number, number, number];
      state.store.mules = 0;
      me(state).stock.alloy = DEVELOPMENT.filterAlloy;
      const { hand } = seatAndHand();
      const route: DevelopmentPlay['route'] = [
        { act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: a },
        { act: 'buyMule' }, { act: 'outfit', outfit: 'energy' }, { act: 'install', plot: b },
        { act: 'filter', plot: c }, { act: 'pub' },
      ];
      hand.follow(state.month, routeOf(route, { ifSoldOut }));
      play(runner, state, hand);
      return { state, plots, hand };
    }

    it("T-AC-7 row 5 (example 3): corral empty, 'sold out', then the route's filters and the pub (ifSoldOut 'pub')", () => {
      const { state, plots, hand } = soldOut('pub');
      const steps = byIndex(hand);
      const notes = hand.routeLog().steps.filter((s) => s.note === 'sold out');
      expect(notes.length, JSON.stringify(hand.done)).toBe(1);
      expect(notes[0]!.outcome).toBe('refused');
      expect(notes[0]!.route).toBeLessThan(3);
      for (const i of [3, 4, 5]) expect(steps.has(i), `the second MULE's step ${i} is not reached`).toBe(false);
      expect(steps.get(6)).toEqual({ route: 6, outcome: 'done' });
      expect(steps.get(7)).toEqual({ route: 7, outcome: 'done' });
      expect(plots.map((t) => t.outfit)).toEqual([null, null, null]);
      expect(plots[2]!.filter).toBe(true);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 row 5: ifSoldOut 'analyse' plays analysesWanted, then the pub; none of the route's steps after", () => {
      const { state, hand } = soldOut('analyse');
      const steps = byIndex(hand);
      expect(hand.routeLog().steps.filter((s) => s.note === 'sold out').length, JSON.stringify(hand.done)).toBe(1);
      for (const i of [3, 4, 5, 6, 7]) expect(steps.has(i), `route step ${i} is not reached`).toBe(false);
      const off = hand.done.filter((e) => e.route === undefined).map((e) => e.action.type);
      expect(off.at(-1), JSON.stringify(hand.done)).toBe('pub');
      expect(off.slice(0, -1).every((t) => t === 'analyse')).toBe(true);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 row 5: ifSoldOut 'stop' plays nothing more, not even the pub", () => {
      const { state, plots, hand } = soldOut('stop');
      expect(hand.routeLog().steps.filter((s) => s.note === 'sold out').length, JSON.stringify(hand.done)).toBe(1);
      expect(hand.routeLog().steps.every((s) => s.route !== undefined && s.route < 3)).toBe(true);
      expect(plots[2]!.filter).toBe(false);
      expect(me(state).doneDeveloping).toBe(false);
    });

    it('T-AC-7 row 6: any other refused step drops its group and the route goes on', () => {
      // Money for the MULE and not its outfit: the outfit is refused with the MULE on the lead (not row 5).
      const { state, plots } = development(2);
      for (const t of plots) t.owner = ME;
      const [a, b] = plots.map((t) => indexOf(state, t)) as [number, number];
      me(state).money = mulePriceFor(state, ME);
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: a }, { act: 'analyse', plot: b }, { act: 'pub' }]));
      play(runner, state, hand);
      const steps = byIndex(hand);
      expect(steps.get(0)).toEqual({ route: 0, outcome: 'done' });
      // Refused: Act false on the tap path, a failed StepRun (the walker's why) on the floor (AM-19).
      expect(steps.get(1)).toEqual({ route: 1, outcome: 'refused', note: runner === 'tick' ? 'refused' : 'offered dim' });
      expect(steps.has(2), 'its install is dropped with it').toBe(false);
      expect(steps.get(3)).toEqual({ route: 3, outcome: 'done' });
      expect(steps.get(4)).toEqual({ route: 4, outcome: 'done' });
      expect(me(state).analysed).toEqual([b]);
      expect(plots[0]!.outfit).toBeNull();
    });

    it("T-AC-7 row 8: a route that ends without a pub goes to the pub, 'pub added'", () => {
      const { state, plots } = development(1);
      const a = indexOf(state, plots[0]!);
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a }]));
      play(runner, state, hand);
      expect(hand.routeLog().steps).toEqual([
        { route: 0, outcome: 'done' },
        { outcome: 'done', note: 'pub added' },
      ]);
      expect(me(state).doneDeveloping).toBe(true);
    });
  });

  describe("on the floor, the runner's own rows (AM-19)", () => {
    beforeEach(() => {
      DEV_STEER.on = true;
    });

    /** Far plots first: walks long enough for the clock to cut. */
    function farPlots(state: GameState, n: number): number[] {
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      const far = (t: Tile) => Math.abs(t.x - store.x) + Math.abs(t.y - store.y);
      return state.tiles.filter((t) => t.terrain === 'plains' && t.owner === null).sort((a, b) => far(b) - far(a)).slice(0, n).map((t) => indexOf(state, t));
    }

    it("'no time': an analysis whose walk no longer fits the clock is skipped, and the pub played", () => {
      const { state } = development(0);
      const [a] = farPlots(state, 1) as [number];
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a }, { act: 'pub' }]));
      floorTurn(state, hand, { leftOf: (_, left) => Math.min(left, 8) });
      expect(byIndex(hand).get(0)).toEqual({ route: 0, outcome: 'skipped', note: 'no time' });
      expect(byIndex(hand).get(1)).toEqual({ route: 1, outcome: 'done' });
      expect(me(state).analysed).toEqual([]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("'hurry': the clock cut short mid-walk leaves the step not reached and takes the route's pub", () => {
      const { state } = development(0);
      const [a, b] = farPlots(state, 2) as [number, number];
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a }, { act: 'analyse', plot: b }, { act: 'pub' }]));
      // A few ticks into the walk, the clock drops to what the pub needs: as a bite or a pack would cost it.
      floorTurn(state, hand, { leftOf: (run, left) => (run < 5 ? left : Math.min(left, 6 - run * 0.01)) });
      const steps = byIndex(hand);
      expect(steps.get(0), JSON.stringify(hand.done)).toEqual({ route: 0, outcome: 'not reached', note: 'hurry' });
      expect(steps.has(1)).toBe(false);
      expect(steps.get(2)).toEqual({ route: 2, outcome: 'done' });
      expect(me(state).analysed).toEqual([]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("'scramble': racing the scramble skips the scouting ahead of its next MULE, and the MULE is installed", () => {
      const { state, plots } = development(1);
      plots[0]!.owner = ME;
      const [a] = farPlots(state, 1) as [number];
      const b = indexOf(state, plots[0]!);
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a }, { act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: b }, { act: 'pub' }]));
      let called = false;
      floorTurn(state, hand, {
        between: (floor, run) => {
          if (called || run !== 2) return floor;
          called = true;
          return { ...floor, moments: { ...floor.moments, scramble: { sinceTick: floor.tick, untilTick: floor.tick + 200, needers: [ME], got: [], over: null, leftOut: [] } } };
        },
      });
      const steps = byIndex(hand);
      expect(steps.get(0), JSON.stringify(hand.done)).toEqual({ route: 0, outcome: 'skipped', note: 'scramble' });
      expect(me(state).analysed).toEqual([]);
      expect(plots[0]!.outfit).toBe('food');
    });
  });
});
