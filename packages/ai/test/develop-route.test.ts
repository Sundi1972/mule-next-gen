import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  list,
  lotDone,
  lotLeader,
  MS_PER_SECOND,
  mulePriceFor,
  outfitCostFor,
  reachOf,
  RuleError,
  setLotWalk,
  settleMoments,
  stepFloor,
  stepLandAuction,
  tileAt,
  tileIndex,
  type DevelopmentPlay,
  type DevFloor,
  type FloorConfig,
  type GameState,
  type Outfit,
  type Tile,
} from '@mule/engine';
import { simFloorConfig } from '../src/floor-turn.js';
import { DevelopHand, type RoutePlay } from '../src/hands/develop.js';
import { draftPlaybook, type LeftOutPick } from '../src/playbook/draft.js';
import { applyAction, arrive, type DevClock } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

// The HC-9 seam: the hand's in-tick draft calls throw, switched on per test; otherwise the real ones.
const seam = vi.hoisted(() => ({ throwing: false }));
vi.mock('../src/playbook/draft.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/playbook/draft.js')>();
  const broken = <A extends unknown[], R>(f: (...args: A) => R) => (...args: A): R => {
    if (seam.throwing) throw new Error('draft broke');
    return f(...args);
  };
  return { ...real, draftMulePick: broken(real.draftMulePick), keptOutfitEarns: broken(real.keptOutfitEarns) };
});

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

/**
 * Month 1's development after ai0 won RIVAL's `outfit` MULE at the land auction, bidding up from planning's listing to
 * the bell, so it starts development leading that MULE; ai0's land cleared, and `n` free plains plots nearest the store
 * its own.
 */
function wonMuleLot(n: number, outfit: Outfit): { state: GameState; plots: Tile[]; lot: Tile } {
  const state = createGame({ seed: 4, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const far = (t: Tile) => Math.abs(t.x - store.x) + Math.abs(t.y - store.y);
  const lot = state.tiles.filter((t) => t.terrain === 'plains' && t.owner === null).sort((a, b) => far(b) - far(a))[0]!;
  Object.assign(lot, { owner: RIVAL, outfit });
  list(state, RIVAL, { item: { kind: 'mule', x: lot.x, y: lot.y }, minimum: 1, unsold: 'keep' });
  while (state.phase !== 'landAuction') advancePhase(state);
  // Any other lot (the colony's) goes unbid; on the MULE lot ai0 holds up until it leads, then presses Done.
  for (let t = 0; me(state).carriedMule === null && state.landAuction!.stage !== 'over' && t < 100_000; t++) {
    const a = state.landAuction!;
    if (a.stage === 'walk' && a.lot!.item.kind === 'mule') {
      const leads = lotLeader(state)?.id === ME;
      setLotWalk(state, ME, leads ? 0 : 1);
      if (leads) lotDone(state, ME);
    } else for (const p of state.players) lotDone(state, p.id);
    stepLandAuction(state, 10);
  }
  expect(me(state).carriedMule, 'ai0 won the MULE lot').toBe(outfit);
  advancePhase(state);
  expect(state.phase).toBe('development');
  for (const t of state.tiles) if (t.owner === ME) t.owner = null;
  const plots = state.tiles.filter((t) => t.terrain === 'plains' && t.owner === null).sort((a, b) => far(a) - far(b)).slice(0, n);
  for (const t of plots) t.owner = ME;
  return { state, plots, lot };
}

function seatAndHand(): { seat: AiSeat; hand: DevelopHand } {
  const seat = new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: SEED });
  return { seat, hand: new DevelopHand(seat.brain, createRng(SEED)) };
}

/** A route of the test's own, played with the draft's seed and no money-maker: as the seat's own draft, or, `own` false, as adopted. */
const routeOf = (route: DevelopmentPlay['route'], extra: Partial<DevelopmentPlay> = {}, own = true): RoutePlay => ({
  part: { route, timeBudgetMs: DEVELOPMENT.fullSeconds * MS_PER_SECOND, ifSoldOut: 'pub', ...extra },
  seed: SEED,
  moneyMaker: null,
  own,
});

/** The seat's own validated development draft, as a hand is given it on the own path. */
function drafted(seat: AiSeat, state: GameState): RoutePlay {
  const pb = seat.draft(state, 'development');
  return { part: pb.development!, seed: SEED, moneyMaker: pb.strategy.moneyMaker, own: true };
}

type Runner = 'tick' | 'steer';

interface TurnHooks {
  /** The floor after each tick, as the test changes it (steer only). */
  between?: (floor: DevFloor, run: number) => DevFloor;
  /** The seconds left as tick `run` ends, from the clock's own (steer only). */
  leftOf?: (run: number, left: number) => number;
  /** After each tick the hand played, with the seconds left it was given. */
  onTick?: (left: number) => void;
}

/** ai0's development turn under DEV_WALK's tap-to-walk, as play.ts's loop runs it (DEV_STEER.on false). */
function tapTurn(state: GameState, hand: DevelopHand, hooks: TurnHooks = {}): void {
  const dt = AI_HANDS.devTickMs;
  const clock: DevClock = { left: me(state).devSeconds, at: 'store' };
  while (clock.left > 0 && !me(state).doneDeveloping) {
    arrive(state, ME, clock);
    hand.tick(state, dt, clock.left, (a) => applyAction(state, ME, a, clock), { at: clock.at!, busy: !!clock.busy });
    hooks.onTick?.(clock.left);
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
    hooks.onTick?.(left);
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
  if (runner === 'tick') tapTurn(state, hand, hooks);
  else floorTurn(state, hand, hooks);
}

/** The route steps' outcomes, by route index; off-route entries apart. */
const byIndex = (hand: DevelopHand, state: GameState) => new Map(hand.routeLog(state).steps.filter((s) => s.route !== undefined).map((s) => [s.route!, s]));

let steer = DEV_STEER.on;
beforeEach(() => {
  steer = DEV_STEER.on;
});
afterEach(() => {
  DEV_STEER.on = steer;
  seam.throwing = false;
  vi.restoreAllMocks();
});

describe("T-AC-7: RULE-9's rows, with their examples", () => {
  describe.each<Runner>(['tick', 'steer'])('under %s', (runner) => {
    beforeEach(() => {
      DEV_STEER.on = runner === 'steer';
    });

    it("T-AC-7 example 1 (rows 7, 8): the draft's route on an unchanged state plays every step done, with no notes", () => {
      const { state, plots } = development(2);
      for (const t of plots) t.owner = ME;
      // Its plots' ground already known, so the draft scouts none: an own route with analyses re-picks its MULEs after
      // them (AM-27, its own rows below), and under the 5 Nov start stock (2 Food, 2 Energy) these plots' best two uses
      // are close enough that the draft would analyse them.
      me(state).analysed.push(...plots.map((t) => indexOf(state, t)));
      const { seat, hand } = seatAndHand();
      const money = me(state).money;
      const route = drafted(seat, state);
      expect(route.part.route.some((s) => s.act === 'analyse'), 'a draft that scouts nothing').toBe(false);
      hand.follow(state.month, route);
      play(runner, state, hand);
      const { steps, usedMs } = hand.routeLog(state);
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
      expect(hand.routeLog(state).steps).toEqual([]);
      expect(me(state).analysed).toEqual([]);
    });

    it("T-AC-7 row 2: past timeBudgetMs, the steps left skip to the pub, 'time budget'", () => {
      const { state, plots } = development(2);
      const [a, b] = plots.map((t) => indexOf(state, t));
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a! }, { act: 'analyse', plot: b! }, { act: 'pub' }], { timeBudgetMs: 1 }));
      play(runner, state, hand);
      const steps = byIndex(hand, state);
      expect(steps.get(0)).toEqual({ route: 0, outcome: 'done' });
      expect(steps.get(1)).toEqual({ route: 1, outcome: 'skipped', note: 'time budget' });
      expect(steps.get(2)).toEqual({ route: 2, outcome: 'done' });
      expect(me(state).analysed).toEqual([a]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 row 2: a budget spent as the first step ends skips the MULE after it and every later step to the pub, 'time budget'", () => {
      /** An adopted route (no re-pick): analyse a, a MULE for b, a filter on b, analyse c, the pub; ai0 holds b. */
      const turn = (timeBudgetMs: number, onTick?: (hand: DevelopHand, left: number) => void) => {
        const { state, plots } = development(3);
        const [a, b, c] = plots.map((t) => indexOf(state, t)) as [number, number, number];
        plots[1]!.owner = ME;
        const { hand } = seatAndHand();
        const route: DevelopmentPlay['route'] = [{ act: 'analyse', plot: a }, { act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: b }, { act: 'filter', plot: b }, { act: 'analyse', plot: c }, { act: 'pub' }];
        hand.follow(state.month, routeOf(route, { timeBudgetMs }, false));
        play(runner, state, hand, { onTick: (left) => onTick?.(hand, left) });
        return { state, plots, hand, a };
      };
      // The budget: the route's time when the MULE comes up, the first step done.
      let start: number | null = null;
      let budget: number | null = null;
      const probe = turn(DEVELOPMENT.fullSeconds * MS_PER_SECOND, (hand, left) => {
        start ??= left;
        if (budget === null && hand.plan()[0]?.startsWith('Buy a MULE')) budget = (start - left) * MS_PER_SECOND;
      });
      expect(budget, JSON.stringify(probe.hand.done)).not.toBeNull();
      const { state, plots, hand, a } = turn(budget!);
      const log = JSON.stringify(hand.done);
      expect(hand.routeLog(state).steps, log).toEqual([
        { route: 0, outcome: 'done' },
        ...[1, 2, 3, 4, 5].map((route) => ({ route, outcome: 'skipped', note: 'time budget' })),
        { route: 6, outcome: 'done' },
      ]);
      expect(me(state).analysed).toEqual([a]);
      expect(plots[1]!.outfit).toBeNull();
      expect(me(state).doneDeveloping).toBe(true);
    });

    it.each(['sold', 'built on'])("T-AC-7 row 3 (example 2): its plot %s since the draft, that MULE is replaced by its own pick, 'stale'", (how) => {
      const { state, plots } = development(4);
      const [drafted0, ...spares] = plots as [Tile, Tile, Tile, Tile];
      drafted0.owner = ME;
      // Known ground: a route with no analyses keeps its drafted MULE until row 3 reads it (AM-27 re-picks one after an analysis).
      me(state).analysed.push(...plots.map((t) => indexOf(state, t)));
      const { seat, hand } = seatAndHand();
      const play0 = drafted(seat, state);
      expect(play0.part.route.some((s) => s.act === 'analyse')).toBe(false);
      // After the draft: the plot goes to a rival at the land auction, or gets a MULE; the seat holds three other idle
      // plots, so the replacement is a pick between them (with two, under the 5 Nov start values, the picks for the
      // first MULE and the second fall alike).
      if (how === 'sold') drafted0.owner = RIVAL;
      else drafted0.outfit = 'food';
      for (const t of spares) t.owner = ME;
      // What a fresh draft on the changed state holds for that MULE, the route's first.
      const fresh = drafted(seat, state).part.route;
      const buy = fresh.findIndex((s) => s.act === 'buyMule');
      expect(buy, JSON.stringify(fresh)).toBeGreaterThanOrEqual(0);
      const [, { outfit }, { plot: freshPlot }] = fresh.slice(buy, buy + 3) as [unknown, { outfit: Outfit }, { plot: number }];
      hand.follow(state.month, play0);
      play(runner, state, hand);
      const plot = indexOf(state, drafted0);
      const log = JSON.stringify(hand.done);
      const stale = hand.routeLog(state).steps.filter((s) => s.note === `stale: plot ${plot}`);
      expect(stale.length, log).toBe(3);
      expect(stale.every((s) => s.outcome === 'replaced')).toBe(true);
      // The promise: the MULE went onto a plot it does hold, idle, as the fresh draft puts it, and none onto the stale one.
      expect(spares.map((t) => indexOf(state, t)), log).toContain(freshPlot);
      expect(state.tiles[freshPlot]!.outfit, log).toBe(outfit);
      expect(drafted0.outfit).toBe(how === 'sold' ? null : 'food');
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 row 3: a filter whose plot was sold since the draft is skipped, 'stale: plot <n>', and the route goes on to the pub", () => {
      const { state, plots } = development(1);
      const sold = plots[0]!;
      const plot = indexOf(state, sold);
      sold.owner = ME;
      me(state).analysed.push(plot);
      me(state).stock.alloy = DEVELOPMENT.filterAlloy;
      const { hand } = seatAndHand();
      const play0 = routeOf([{ act: 'filter', plot }, { act: 'pub' }]);
      sold.owner = RIVAL;
      hand.follow(state.month, play0);
      play(runner, state, hand);
      expect(hand.routeLog(state).steps, JSON.stringify(hand.done)).toEqual([
        { route: 0, outcome: 'skipped', note: `stale: plot ${plot}` },
        { route: 1, outcome: 'done' },
      ]);
      expect(sold.filter).toBe(false);
      expect(me(state).stock.alloy).toBe(DEVELOPMENT.filterAlloy);
    });

    it("T-AC-7 row 4: an analysis of a plot it already analysed is skipped, 'already analysed'", () => {
      const { state, plots } = development(2);
      const [a, b] = plots.map((t) => indexOf(state, t));
      me(state).analysed.push(a!);
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a! }, { act: 'analyse', plot: b! }, { act: 'pub' }]));
      play(runner, state, hand);
      const steps = byIndex(hand, state);
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
      // On the floor an unanalysed plot offers ANALYSE before FIT A FILTER: the filter's plot is known ground.
      me(state).analysed.push(c);
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
      const steps = byIndex(hand, state);
      const notes = hand.routeLog(state).steps.filter((s) => s.note === 'sold out');
      expect(notes.length, JSON.stringify(hand.done)).toBe(1);
      expect(notes[0]!.outcome).toBe('refused');
      expect(notes[0]!.route).toBeLessThan(3);
      for (const i of [3, 4, 5]) expect(steps.has(i), `the second MULE's step ${i} is not reached`).toBe(false);
      expect(steps.get(6), JSON.stringify(hand.done)).toEqual({ route: 6, outcome: 'done' });
      expect(steps.get(7)).toEqual({ route: 7, outcome: 'done' });
      expect(plots.map((t) => t.outfit)).toEqual([null, null, null]);
      expect(plots[2]!.filter).toBe(true);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 row 5: ifSoldOut 'analyse' plays analysesWanted, then the pub; none of the route's steps after", () => {
      const { state, hand } = soldOut('analyse');
      const steps = byIndex(hand, state);
      expect(hand.routeLog(state).steps.filter((s) => s.note === 'sold out').length, JSON.stringify(hand.done)).toBe(1);
      for (const i of [3, 4, 5, 6, 7]) expect(steps.has(i), `route step ${i} is not reached`).toBe(false);
      // Off the route: the analyses it wants now, each done, then the pub.
      const off = hand.done.filter((e) => e.route === undefined);
      expect(off.every((e) => (e.action.type === 'analyse' || e.action.type === 'pub') && e.ok), JSON.stringify(hand.done)).toBe(true);
      expect(me(state).analysed, 'the filter plot, known before, and the ones analysed now').toHaveLength(1 + off.filter((e) => e.action.type === 'analyse').length);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 row 5: ifSoldOut 'stop' plays nothing more, not even the pub", () => {
      const { state, plots, hand } = soldOut('stop');
      expect(hand.routeLog(state).steps.filter((s) => s.note === 'sold out').length, JSON.stringify(hand.done)).toBe(1);
      expect(hand.routeLog(state).steps.every((s) => s.route !== undefined && s.route < 3)).toBe(true);
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
      const steps = byIndex(hand, state);
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
      expect(hand.routeLog(state).steps).toEqual([
        { route: 0, outcome: 'done' },
        { outcome: 'done', note: 'pub added' },
      ]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 (AM-27): a MULE won at the land auction is the route's first, installed with no buy ('led'), and the route's other MULE still plays", () => {
      const { state, plots } = wonMuleLot(2, 'water');
      // Known ground, so the route has no analyses and plays as drafted.
      me(state).analysed.push(...plots.map((t) => indexOf(state, t)));
      const { seat, hand } = seatAndHand();
      const play0 = drafted(seat, state);
      const route = play0.part.route;
      const buys = route.flatMap((s, i) => (s.act === 'buyMule' ? [i] : []));
      expect(buys, JSON.stringify(route)).toHaveLength(2);
      expect(route.some((s) => s.act === 'analyse')).toBe(false);
      const corral = state.store.mules;
      hand.follow(state.month, play0);
      play(runner, state, hand);
      const steps = byIndex(hand, state);
      const log = JSON.stringify(hand.done);
      expect(steps.get(buys[0]!), log).toEqual({ route: buys[0], outcome: 'done', note: 'led' });
      expect(steps.get(buys[1]!), log).toEqual({ route: buys[1], outcome: 'done' });
      // The promise: both MULEs stand on the route's plots with the route's outfits, and only the second was bought.
      for (const i of buys) expect(state.tiles[route[i + 2]!.plot!]!.outfit, log).toBe(route[i + 1]!.outfit);
      expect(state.store.mules).toBe(corral - 1);
      expect(me(state).carriedMule).toBeNull();
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 (AM-27): a lot MULE kept fitted for a good no idle plot of the seat makes is still installed, its outfit noted 'kept outfit, no gain'", () => {
      // A Smithore MULE led in, and only plains to put it on: it makes nothing there, but it is the seat's.
      const { state, plots } = wonMuleLot(2, 'smithore');
      me(state).analysed.push(...plots.map((t) => indexOf(state, t)));
      const { seat, hand } = seatAndHand();
      const play0 = drafted(seat, state);
      const route = play0.part.route;
      const first = route.findIndex((s) => s.act === 'buyMule');
      expect(route.slice(first, first + 2), JSON.stringify(route)).toEqual([{ act: 'buyMule' }, { act: 'outfit', outfit: 'smithore' }]);
      hand.follow(state.month, play0);
      play(runner, state, hand);
      const steps = byIndex(hand, state);
      const log = JSON.stringify(hand.done);
      expect(steps.get(first), log).toEqual({ route: first, outcome: 'done', note: 'led' });
      expect(steps.get(first + 1), log).toEqual({ route: first + 1, outcome: 'done', note: 'kept outfit, no gain' });
      expect(steps.get(first + 2), log).toEqual({ route: first + 2, outcome: 'done' });
      expect(state.tiles[route[first + 2]!.plot!]!.outfit, log).toBe('smithore');
      expect(me(state).carriedMule).toBeNull();
    });

    /**
     * Two idle plains plots of ai0's, and a route that analyses the first and installs a Smithore MULE on it: not the own
     * pick there. Played as the seat's own draft, or, `own` false, as an adopted route; `money` is ai0's as it starts.
     */
    function smithoreRoute(analyse: boolean, { own = true, money }: { own?: boolean; money?: number } = {}) {
      const { state, plots } = development(2);
      for (const t of plots) t.owner = ME;
      if (money !== undefined) me(state).money = money;
      const [a] = plots.map((t) => indexOf(state, t)) as [number, number];
      const route: DevelopmentPlay['route'] = [
        ...(analyse ? [{ act: 'analyse' as const, plot: a }] : []),
        { act: 'buyMule' }, { act: 'outfit', outfit: 'smithore' }, { act: 'install', plot: a },
        { act: 'pub' },
      ];
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf(route, {}, own));
      play(runner, state, hand);
      return { state, plots, hand, log: JSON.stringify(hand.done) };
    }

    it("T-AC-7 (AM-27): after a route's analyses its MULE is re-picked, 'replaced' with 'ground analysed', and MULEs are added up to mulesPerMonth, 'MULE added'", () => {
      const { state, plots, hand, log } = smithoreRoute(true);
      const steps = byIndex(hand, state);
      expect(steps.get(0)).toEqual({ route: 0, outcome: 'done' });
      for (const i of [1, 2, 3]) expect(steps.get(i), log).toEqual({ route: i, outcome: 'replaced', note: 'ground analysed' });
      expect(steps.get(4)).toEqual({ route: 4, outcome: 'done' });
      const added = hand.routeLog(state).steps.filter((s) => s.note === 'MULE added');
      expect(added.length, log).toBeGreaterThan(0);
      expect(added.every((s) => s.outcome === 'done' && s.route === undefined), log).toBe(true);
      // The promise: no Smithore MULE on the analysed plot; the seat led out its level's MULEs, each on its own plot.
      expect(plots[0]!.outfit, log).not.toBe('smithore');
      expect(plots.every((t) => t.outfit !== null), log).toBe(true);
      expect(hand.done.filter((e) => e.action.type === 'install' && e.ok)).toHaveLength(seatAndHand().seat.mind.level.mulesPerMonth);
      expect(me(state).carriedMule).toBeNull();
    });

    it("T-AC-7 (AM-27): an own re-pick that says 'stop' drops the MULE's group, logged 'skipped' with 'ground analysed', and adds none", () => {
      // Nothing on hand: after the analysis no MULE can be paid for, so the own pick keeps the cash.
      const { state, plots, hand, log } = smithoreRoute(true, { money: 0 });
      expect(hand.routeLog(state).steps, log).toEqual([
        { route: 0, outcome: 'done' },
        ...[1, 2, 3].map((route) => ({ route, outcome: 'skipped', note: 'ground analysed' })),
        { route: 4, outcome: 'done' },
      ]);
      expect(plots.map((t) => t.outfit)).toEqual([null, null]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 (AM-27): an adopted route with analyses plays its MULE as adopted: no re-pick, no 'replaced', no 'MULE added'", () => {
      // The same state and route the own path re-picks above ('ground analysed'), handed in as an adopted part.
      const { state, plots, hand, log } = smithoreRoute(true, { own: false });
      expect(hand.routeLog(state).steps, log).toEqual([0, 1, 2, 3, 4].map((route) => ({ route, outcome: 'done' })));
      // The promise: the adopted MULE stands where the adopted route put it, with its outfit, and no other.
      expect(plots.map((t) => t.outfit), log).toEqual(['smithore', null]);
      expect(me(state).carriedMule).toBeNull();
    });

    it('T-AC-7 (AM-27): a route with no analyses plays its MULE as drafted, adds none, and replaces none', () => {
      const { state, plots, hand, log } = smithoreRoute(false);
      expect(hand.routeLog(state).steps, log).toEqual([0, 1, 2, 3].map((route) => ({ route, outcome: 'done' })));
      expect(plots.map((t) => t.outfit)).toEqual(['smithore', null]);
    });

    it("T-AC-7 (FM-led-no-gain): while it still leads a MULE, a route's filter is skipped, 'leading', and nothing is refused; one after the install plays", () => {
      // A Food MULE led in, and an adopted route that fits a filter on the other plot before the led MULE's group, and one
      // on its own plot after its install.
      const { state, plots } = wonMuleLot(2, 'food');
      const [home, other] = plots.map((t) => indexOf(state, t)) as [number, number];
      me(state).analysed.push(home, other);
      me(state).stock.alloy = DEVELOPMENT.filterAlloy;
      const { hand } = seatAndHand();
      const route: DevelopmentPlay['route'] = [{ act: 'filter', plot: other }, { act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: home }, { act: 'filter', plot: home }, { act: 'pub' }];
      hand.follow(state.month, routeOf(route, {}, false));
      play(runner, state, hand);
      const log = JSON.stringify(hand.done);
      expect(hand.routeLog(state).steps, log).toEqual([
        { route: 0, outcome: 'skipped', note: 'leading' },
        { route: 1, outcome: 'done', note: 'led' },
        { route: 2, outcome: 'done', note: 'led' },
        { route: 3, outcome: 'done' },
        { route: 4, outcome: 'done' },
        { route: 5, outcome: 'done' },
      ]);
      expect(hand.done.filter((e) => e.outcome === 'refused'), log).toEqual([]);
      // The promise: the lot MULE stands on its plot as it came; no filter went on while it was led, and the one after the
      // install did.
      expect(state.tiles[home]!.outfit, log).toBe('food');
      expect(state.tiles[other]!.outfit, log).toBeNull();
      expect(state.tiles[other]!.filter).toBe(false);
      expect(state.tiles[home]!.filter, log).toBe(true);
      expect(me(state).stock.alloy).toBe(0);
      expect(me(state).carriedMule).toBeNull();
      expect(me(state).doneDeveloping).toBe(true);
    });

    /** The errors the seat logs while `run` plays with the hand's draft calls throwing. */
    function throwingDraft<T>(run: () => T): { result: T; logged: string[] } {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      seam.throwing = true;
      try {
        return { result: run(), logged: errors.mock.calls.map((c) => String(c[0])) };
      } finally {
        seam.throwing = false;
      }
    }

    // trace-allow: HC-9, the spec's own failure-mode id for a draft or validator error (spec §4, "Retry, poison, page?"); trace-check reads no HC- ids
    it("HC-9: an own re-pick after the analyses whose draft throws is logged with the seat and plays as 'stop'; no MULE is added", () => {
      const { result, logged } = throwingDraft(() => smithoreRoute(true));
      const { state, plots, hand, log } = result;
      expect(hand.routeLog(state).steps, log).toEqual([
        { route: 0, outcome: 'done' },
        ...[1, 2, 3].map((route) => ({ route, outcome: 'skipped', note: 'ground analysed' })),
        { route: 4, outcome: 'done' },
      ]);
      expect(logged.length, log).toBeGreaterThan(0);
      for (const line of logged) expect(line).toMatch(/^AI seat ai0: .*draft broke$/);
      expect(plots.map((t) => t.outfit)).toEqual([null, null]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    // trace-allow: HC-9, the spec's own failure-mode id for a draft or validator error (spec §4, "Retry, poison, page?"); trace-check reads no HC- ids
    it("HC-9: a stale MULE whose replacement draft throws is logged with the seat and dropped, its steps 'skipped', and the route goes on to the pub", () => {
      const { state, plots } = development(2);
      const [stale, spare] = plots as [Tile, Tile];
      stale.owner = ME;
      me(state).analysed.push(...plots.map((t) => indexOf(state, t)));
      const { seat, hand } = seatAndHand();
      const play0 = drafted(seat, state);
      stale.owner = RIVAL;
      spare.owner = ME;
      hand.follow(state.month, play0);
      const { logged } = throwingDraft(() => play(runner, state, hand));
      const log = JSON.stringify(hand.done);
      // The re-pick plays as 'stop': nothing replaces the MULE, so its steps are skipped, not replaced.
      expect(hand.routeLog(state).steps.filter((s) => s.note === `stale: plot ${indexOf(state, stale)}`).map((s) => s.outcome), log).toEqual(['skipped', 'skipped', 'skipped']);
      expect(logged, log).toEqual([expect.stringMatching(/^AI seat ai0: .*draft broke$/)]);
      expect(hand.done.some((e) => e.action.type === 'buyMule' && e.ok), 'no MULE bought in its place').toBe(false);
      expect(spare.outfit).toBeNull();
      expect(me(state).doneDeveloping).toBe(true);
    });

    // trace-allow: HC-9, the spec's own failure-mode id for a draft or validator error (spec §4, "Retry, poison, page?"); trace-check reads no HC- ids
    it("HC-9: a led MULE's kept-outfit check that throws is logged with the seat, and the MULE is still installed, 'led'", () => {
      const { state, plots } = wonMuleLot(2, 'smithore');
      me(state).analysed.push(...plots.map((t) => indexOf(state, t)));
      const { seat, hand } = seatAndHand();
      const play0 = drafted(seat, state);
      const route = play0.part.route;
      const first = route.findIndex((s) => s.act === 'buyMule');
      hand.follow(state.month, play0);
      const { logged } = throwingDraft(() => play(runner, state, hand));
      const steps = byIndex(hand, state);
      const log = JSON.stringify(hand.done);
      expect(logged, log).toEqual([expect.stringMatching(/^AI seat ai0: .*draft broke$/)]);
      expect(steps.get(first + 1), log).toEqual({ route: first + 1, outcome: 'done', note: 'led' });
      expect(steps.get(first + 2), log).toEqual({ route: first + 2, outcome: 'done' });
      expect(state.tiles[route[first + 2]!.plot!]!.outfit, log).toBe('smithore');
      expect(me(state).carriedMule).toBeNull();
    });
  });

  it("T-AC-7 (AM-27): the development draft of a seat leading a MULE won at the land auction holds its MULEs, and as many as a seat leading none", () => {
    const { seat } = seatAndHand();
    const mules = (state: GameState) => drafted(seat, state).part.route.filter((s) => s.act === 'buyMule').length;
    const won = wonMuleLot(2, 'water').state;
    expect(me(won).carriedMule).toBe('water');
    const { state: none, plots } = development(2);
    for (const t of plots) t.owner = ME;
    expect(mules(none)).toBe(2);
    expect(mules(won), JSON.stringify(drafted(seat, won).part.route)).toBe(2);
  });

  it("T-AC-7 (AM-27): a MULE pick the draft's copy refuses is logged and left out, and the picks go on", () => {
    // A led MULE that has bolted can be neither outfitted nor installed until it is caught, so each pick for it is refused.
    const { state } = wonMuleLot(2, 'food');
    me(state).muleBolted = true;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { seat } = seatAndHand();
    const route = drafted(seat, state).part.route;
    const notes = errors.mock.calls.map((c) => String(c[0]));
    errors.mockRestore();
    // Both picks, each logged: the first refusal did not end the picks.
    expect(notes, JSON.stringify(route)).toEqual([1, 2].map((k) => expect.stringMatching(new RegExp(`^AI seat ai0: the development draft left out MULE ${k} \\(food on plot \\d+\\), refused: Your MULE bolted`))));
    // The draft itself logs nothing: it hands the picks it left out to its caller.
    const leftOut: LeftOutPick[] = [];
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    draftPlaybook({ state, seat: ME, mind: seat.mind, seed: SEED, phase: 'development' }, leftOut);
    expect(quiet).not.toHaveBeenCalled();
    expect(leftOut.map((p) => [p.mule, p.outfit])).toEqual([[1, 'food'], [2, 'food']]);
  });

  it("T-AC-7 (AM-27): a replanned edit's re-draft logs the MULE picks it left out at the seat's gate, as the seat's own draft does", () => {
    // The bolted led MULE above: every pick for it is refused, in the draft and in a re-draft under an edited strategy.
    const { state } = wonMuleLot(2, 'food');
    me(state).muleBolted = true;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { seat } = seatAndHand();
    const draft = seat.draft(state, 'development');
    errors.mockClear();
    const moneyMaker = draft.strategy.moneyMaker === 'smithore' ? 'crystite' : 'smithore';
    const { playbook } = seat.validator()(state, ME, draft, [{ path: '/strategy/moneyMaker', to: moneyMaker, reason: 'This pays.' }]);
    const notes = errors.mock.calls.map((c) => String(c[0]));
    errors.mockRestore();
    expect(playbook.strategy.moneyMaker, 'the edit plays, so the route is re-drafted').toBe(moneyMaker);
    // No silent end: each pick the re-draft left out is logged once, with the seat.
    expect(notes, JSON.stringify(playbook.development!.route)).toEqual([1, 2].map((k) => expect.stringMatching(new RegExp(`^AI seat ai0: the development draft left out MULE ${k} \\(\\w+ on plot \\d+\\), refused: Your MULE bolted`))));
  });

  describe("on the floor, the runner's own rows (AM-19)", () => {
    beforeEach(() => {
      DEV_STEER.on = true;
    });

    /** Free plains plots, the farthest first; or, given `d`, the nearest at least `d` tiles off: walks long enough for the clock to cut. */
    function farPlots(state: GameState, n: number, d?: number): number[] {
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      const far = (t: Tile) => Math.abs(t.x - store.x) + Math.abs(t.y - store.y);
      const free = state.tiles.filter((t) => t.terrain === 'plains' && t.owner === null && far(t) >= (d ?? 0));
      return free.sort((a, b) => (d === undefined ? far(b) - far(a) : far(a) - far(b))).slice(0, n).map((t) => indexOf(state, t));
    }

    it("T-AC-7 AM-19 'no time': an analysis whose walk no longer fits the clock is skipped, and the pub played", () => {
      const { state } = development(0);
      const [a] = farPlots(state, 1) as [number];
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a }, { act: 'pub' }]));
      floorTurn(state, hand, { leftOf: (_, left) => Math.min(left, 8) });
      expect(byIndex(hand, state).get(0)).toEqual({ route: 0, outcome: 'skipped', note: 'no time' });
      expect(byIndex(hand, state).get(1)).toEqual({ route: 1, outcome: 'done' });
      expect(me(state).analysed).toEqual([]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 AM-19 'hurry': the clock cut short mid-walk leaves the step not reached and takes the route's pub", () => {
      const { state } = development(0);
      const [a, b] = farPlots(state, 2, 4) as [number, number];
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a }, { act: 'analyse', plot: b }, { act: 'pub' }]));
      // A few ticks into the walk, the clock drops to what the pub needs: as a bite or a pack would cost it.
      floorTurn(state, hand, { leftOf: (run, left) => (run < 5 ? left : Math.min(left, 4 - run * 0.01)) });
      const steps = byIndex(hand, state);
      expect(steps.get(0), JSON.stringify(hand.done)).toEqual({ route: 0, outcome: 'not reached', note: 'hurry' });
      expect(steps.has(1)).toBe(false);
      expect(steps.get(2)).toEqual({ route: 2, outcome: 'done' });
      expect(me(state).analysed).toEqual([]);
      expect(me(state).doneDeveloping).toBe(true);
    });

    /**
     * FM-floor-lake-stand's map: seed 14's for four seats, ai0 holding the lake at 12·8 (0-based), whose shores are its
     * own swamps at 11·7 and 11·8 (each with a MULE, so Reach there works the swamp) and plains the lakes wall off from
     * the store; and an idle plains plot by the store. No walk reaches a spot to install on the lake from.
     */
    function lakeWithNoStand(): { state: GameState; lake: Tile; spare: Tile } {
      const state = createGame({ seed: 14, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
      while (state.phase !== 'development') advancePhase(state);
      for (const t of state.tiles) if (t.owner === ME) t.owner = null;
      const at = (x: number, y: number) => tileAt(state.tiles, state.width, x, y)!;
      const lake = at(12, 8);
      lake.owner = ME;
      for (const t of [at(11, 7), at(11, 8)]) {
        t.owner = ME;
        t.outfit = 'water';
      }
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      const far = (t: Tile) => Math.abs(t.x - store.x) + Math.abs(t.y - store.y);
      const spare = state.tiles.filter((t) => t.terrain === 'plains' && t.owner === null).sort((a, b) => far(a) - far(b))[0]!;
      spare.owner = ME;
      return { state, lake, spare };
    }

    it("T-AC-7 row 3 (AM-25): a MULE for a plot the floor's walk vetoes is replaced by its own pick, 'stale: <the veto>', and none is lost", () => {
      const { state, lake, spare } = lakeWithNoStand();
      const { hand } = seatAndHand();
      const price = mulePriceFor(state, ME);
      const money = me(state).money;
      hand.follow(state.month, routeOf([{ act: 'buyMule' }, { act: 'outfit', outfit: 'water' }, { act: 'install', plot: indexOf(state, lake) }, { act: 'pub' }]));
      // The money just before the pub pays out: what the MULEs cost.
      let beforePub = money;
      floorTurn(state, hand, {
        between: (floor) => {
          if (!me(state).doneDeveloping) beforePub = me(state).money;
          return floor;
        },
      });
      const log = JSON.stringify(hand.done);
      const steps = hand.routeLog(state).steps;
      expect(steps.slice(0, 3).map((s) => s.outcome), log).toEqual(['replaced', 'replaced', 'replaced']);
      expect(steps.slice(0, 3).every((s) => /^stale: the walk takes/.test(s.note ?? '')), log).toBe(true);
      // The promise: no MULE paid for and lost. Every MULE bought stands on a plot, and the money went on those alone.
      const ok = (type: string) => hand.done.filter((e) => e.action.type === type && e.ok).length;
      expect(ok('buyMule'), log).toBe(ok('install'));
      expect(me(state).carriedMule, 'no MULE on the lead').toBeNull();
      expect(lake.outfit, 'none on the lake').toBeNull();
      expect(spare.outfit, `the own pick's MULE: ${log}`).not.toBeNull();
      expect(money - beforePub).toBe(price + outfitCostFor(state, ME, spare.outfit!));
      expect(me(state).doneDeveloping).toBe(true);
    });

    it.each(['known', 'unknown'] as const)(
      "T-AC-7 (AM-27): led on the floor (%s ground), a lot MULE already fitted keeps its outfit, installed on a plot the pick chose, and no MULE is lost",
      (ground) => {
        // A Food MULE led in, on plains the seat's own pick would give Water: the floor cannot fit it again.
        const { state, plots } = wonMuleLot(2, 'food');
        // Known ground: the draft's pick plays; unknown: the route analyses first, and the hand picks the MULE again.
        if (ground === 'known') me(state).analysed.push(...plots.map((t) => indexOf(state, t)));
        const { seat, hand } = seatAndHand();
        const play0 = drafted(seat, state);
        const route = play0.part.route;
        const first = route.findIndex((s) => s.act === 'buyMule');
        expect(first, JSON.stringify(route)).toBeGreaterThanOrEqual(0);
        expect(route.slice(0, first).some((s) => s.act === 'analyse'), JSON.stringify(route)).toBe(ground === 'unknown');
        // The draft fits the led MULE no other outfit: only its plot is picked.
        expect(route[first + 1], JSON.stringify(route)).toEqual({ act: 'outfit', outfit: 'food' });
        hand.follow(state.month, play0);
        floorTurn(state, hand);
        const log = JSON.stringify(hand.done);
        // The led MULE's buy and outfit: done 'led', whether the route's group or the own pick in its place.
        const led = hand.done.filter((e) => e.why === 'led');
        expect(led.map((e) => e.action), log).toEqual([{ type: 'buyMule' }, { type: 'outfit', outfit: 'food' }]);
        // The promise: the first MULE installed is the lot's, as it came, on one of the seat's plots; none is lost.
        const install = hand.done.find((e) => e.action.type === 'install' && e.ok);
        expect(install, log).toBeDefined();
        const at = install!.action.type === 'install' ? tileAt(state.tiles, state.width, install!.action.x, install!.action.y)! : null;
        expect(plots, log).toContain(at);
        expect(at!.outfit, log).toBe('food');
        // (Leading a MULE, the floor's plot button offers install, not an analysis: those are refused; no MULE step is.)
        expect(hand.done.filter((e) => e.outcome === 'refused' && e.action.type !== 'analyse'), log).toEqual([]);
        expect(me(state).carriedMule, log).toBeNull();
        expect(me(state).doneDeveloping).toBe(true);
      },
    );

    it("T-AC-7 (AM-27): a 'MULE added' whose errand no longer fits the clock is not bought, so no MULE is lost", () => {
      const { state, plots } = development(2);
      for (const t of plots) t.owner = ME;
      const a = indexOf(state, plots[0]!);
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a }, { act: 'pub' }]));
      const corral = state.store.mules;
      // Once the added MULE is on its way to the corral, the clock drops: as a pack or a bite would cost it.
      let buying = false;
      floorTurn(state, hand, {
        between: (floor) => {
          buying ||= hand.plan()[0] === 'Buy a MULE at the corral';
          return floor;
        },
        leftOf: (_, left) => (buying ? Math.min(left, 14) : left),
      });
      const log = JSON.stringify(hand.done);
      expect(buying, `a MULE was added after the analysis: ${log}`).toBe(true);
      expect(hand.routeLog(state).steps, log).toContainEqual({ outcome: 'skipped', note: 'no time' });
      // The promise: no MULE paid for and lost.
      expect(hand.done.some((e) => e.action.type === 'buyMule' && e.ok), log).toBe(false);
      expect(state.store.mules).toBe(corral);
      expect(me(state).carriedMule).toBeNull();
      expect(me(state).doneDeveloping).toBe(true);
    });

    it("T-AC-7 AM-19 'scramble': racing the scramble skips the scouting ahead of its next MULE, and the MULE is installed", () => {
      const { state, plots } = development(1);
      plots[0]!.owner = ME;
      const [a, a2] = farPlots(state, 2) as [number, number];
      const b = indexOf(state, plots[0]!);
      const { hand } = seatAndHand();
      hand.follow(state.month, routeOf([{ act: 'analyse', plot: a }, { act: 'analyse', plot: a2 }, { act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: b }, { act: 'pub' }]));
      let called = false;
      floorTurn(state, hand, {
        between: (floor, run) => {
          if (called || run !== 2) return floor;
          called = true;
          return { ...floor, moments: { ...floor.moments, scramble: { sinceTick: floor.tick, untilTick: floor.tick + 200, needers: [ME], got: [], over: null, leftOut: [] } } };
        },
      });
      const steps = byIndex(hand, state);
      // The one it was walking, and the one queued behind it.
      expect(steps.get(0), JSON.stringify(hand.done)).toEqual({ route: 0, outcome: 'skipped', note: 'scramble' });
      expect(steps.get(1)).toEqual({ route: 1, outcome: 'skipped', note: 'scramble' });
      expect(steps.get(4)).toEqual({ route: 4, outcome: 'done' });
      expect(me(state).analysed).toEqual([]);
      expect(plots[0]!.outfit).toBe('food');
    });
  });
});
