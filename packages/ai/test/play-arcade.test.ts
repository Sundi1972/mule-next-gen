import { describe, expect, it, vi } from 'vitest';
import {
  advancePhase,
  applyReach,
  buildFloor,
  createGame,
  DEV_STEER,
  DEVELOPMENT,
  doorPresses,
  hasAnalysed,
  MS_PER_SECOND,
  pressOrder,
  pubPayoutFor,
  reachOf,
  settleMoments,
  stepFloor,
  terrainShare,
  tileAt,
  type AiLevelId,
  type DevFloor,
  type FloorColonist,
  type FloorConfig,
  type GameState,
  type Outfit,
  GLINT,
  SCRAMBLE,
  WOLVES,
} from '@mule/engine';
import { FloorWalker, type StepRun } from '../src/hands/floor-walker.js';
import { muleLegs, placePoint, pubSeconds } from '../src/floor-time.js';
import { biteCostPub, playFloorPhase, simFloorConfig } from '../src/floor-turn.js';
import { ROTATION, simSeats } from '../src/lineup.js';
import type { FloorMomentCounts } from '../src/floor-turn.js';
import { playGame, type DevTurn, type SeatSpec } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

/** Every level at the table, the slowest (Rookie) twice: the spec's Kai is a rookie. */
const LEVELS: AiLevelId[] = ['rookie', 'trader', 'tycoon', 'rookie'];
const seatsFor = (seed: number): SeatSpec[] => LEVELS.map((level, i) => ({ level, persona: ROTATION[(i + seed) % ROTATION.length]! }));

/** Runs `body` with DEV_STEER.on set, restoring it after. */
function steered<T>(body: () => T): T {
  const saved = DEV_STEER.on;
  DEV_STEER.on = true;
  try {
    return body();
  } finally {
    DEV_STEER.on = saved;
  }
}

/** The first `phases` development turns of AI-only games from seed 1 on, each the four seats' turns of one month. */
function steeredTurns(phases: number): DevTurn[][] {
  return steered(() => {
    const out: DevTurn[][] = [];
    for (let seed = 1; out.length < phases; seed++) {
      const { turns } = playGame(seed, seatsFor(seed));
      const months = [...new Set(turns.map((t) => t.month))];
      for (const m of months) if (out.length < phases) out.push(turns.filter((t) => t.month === m));
    }
    return out;
  });
}

/** The moments of the first `phases` development phases of AI-only games from seed 1 on, as steeredTurns plays them. */
function steeredMoments(phases: number): FloorMomentCounts[] {
  return steered(() => {
    const out: FloorMomentCounts[] = [];
    for (let seed = 1; out.length < phases; seed++) out.push(...playGame(seed, seatsFor(seed)).moments.slice(0, phases - out.length));
    return out;
  });
}

const sum = (counts: readonly FloorMomentCounts[], key: keyof FloorMomentCounts) => counts.reduce((n, c) => n + c[key], 0);

describe('the AI walks the floor, and the sim plays it (arcade C9, C10)', () => {
  it('T-AC-5 (AM-26): in 20 seeded AI-only turns every AI colonist reaches the pub within the turn, but where a wolf\'s bite cost it the pub', { timeout: 120_000 }, () => {
    const phases = steeredTurns(20);
    expect(phases).toHaveLength(20);
    for (const [i, seats] of phases.entries()) {
      expect(seats, `turn ${i}: one record a seat`).toHaveLength(LEVELS.length);
      for (const t of seats) {
        const why = `turn ${i}, month ${t.month}, ${t.id}`;
        // The one excuse (AM-26): a wolf's bite cost it the pub, its bitten walk there longer than the time left when the
        // bite landed. The share of such turns is judged on the sim's sample, below; here each one is shown.
        if (t.pubAt === null && t.biteCostPub) {
          console.log(`T-AC-5 excused (AM-26): ${why}: a wolf's bite cost it the pub`);
          continue;
        }
        expect(t.pubAt, `${why}: never reached the pub`).not.toBeNull();
        expect(t.pubAt!, `${why}: reached the pub after the clock`).toBeLessThanOrEqual(DEVELOPMENT.fullSeconds);
      }
    }
    // Reaching the pub is not the whole turn: the AI walked MULEs out and installed them on the way. The moments may
    // not cost it them (RULE-8: a detour never breaks the errand), so the bar is the one the floor had without them.
    const installs = phases.flat().reduce((n, t) => n + t.installs, 0);
    expect(installs, `MULEs installed in ${phases.length} turns`).toBeGreaterThan(phases.length);
  });

  it('T-AC-5: the moments happen in AI turns: packs met and played out, glints lit and won', { timeout: 120_000 }, () => {
    const moments = steeredMoments(20);
    expect(moments).toHaveLength(20);
    expect(sum(moments, 'glints'), 'glints lit in 20 turns').toBeGreaterThanOrEqual(5);
    expect(sum(moments, 'packs'), 'packs met').toBeGreaterThan(0);
    expect(sum(moments, 'fights') + sum(moments, 'runs'), 'packs fought or run from').toBeGreaterThan(0);
    expect(sum(moments, 'glintsWon'), 'glints won').toBeGreaterThan(0);
  });

  it('T-AC-5 negative: with botsSpareTime off, bots race glints they have no time for and miss the pub', { timeout: 120_000 }, () => {
    const saved = DEV_STEER.botsSpareTime;
    DEV_STEER.botsSpareTime = false;
    try {
      const turns = steeredTurns(20).flat();
      expect(turns.filter((t) => t.pubAt === null).length, 'AI turns that missed the pub').toBeGreaterThan(0);
    } finally {
      DEV_STEER.botsSpareTime = saved;
    }
  });

  it('T-AC-5 negative: with a store floor that takes longer than the clock to cross, no colonist reaches the pub', { timeout: 120_000 }, () => {
    const saved = { floorSeconds: DEV_STEER.floorSeconds, waits: DEV_STEER.month1WaitsForFirstMule };
    // The pub is three hall units in from the right door, a third of the door-to-corral walk: four clocks a crossing.
    DEV_STEER.floorSeconds = DEVELOPMENT.fullSeconds * 4;
    // Month 1's waiting clock would give them the time: this is the clock alone.
    DEV_STEER.month1WaitsForFirstMule = false;
    try {
      const [first] = steeredTurns(1);
      expect(first!.map((t) => t.pubAt)).toEqual(LEVELS.map(() => null));
    } finally {
      DEV_STEER.floorSeconds = saved.floorSeconds;
      DEV_STEER.month1WaitsForFirstMule = saved.waits;
    }
  });
});

/**
 * The sim's own sample (T-AC-5's observed_at is `pnpm sim`): SIM_GAMES AI-only games from seed 1, its lineup (four
 * Traders), politics on, steered; played once for every case that reads it. 20 games: the glint share was 45% at 10,
 * 43% at 20 and 42% at 40, so 20 is the smallest steady one at about a second a game.
 */
const SIM_GAMES = 20;
/**
 * The first case to await the sample plays it: about 58 s here with #259's 60-second turns (39 s at 50 s), so its
 * cases allow five minutes, as INV-estimate's sample does, for a slower CI machine. A hang still fails, at that bound.
 */
const SAMPLE_TIMEOUT_MS = 300_000;
type SimSample = { moments: FloorMomentCounts[]; turns: DevTurn[] };
let simSample: Promise<SimSample> | null = null;
/**
 * The sample, played a game at a time with a yield to the event loop between games: played in one go it holds the
 * worker for about 40 s, and vitest's worker times out reporting to the runner (onTaskUpdate) and fails the run.
 */
function simGames(): Promise<SimSample> {
  simSample ??= (async () => {
    const out: SimSample = { moments: [], turns: [] };
    for (let i = 0; i < SIM_GAMES; i++) {
      const g = steered(() => playGame(i + 1, simSeats(4, 'trader', i + 1, null), { politics: true }));
      out.moments.push(...g.moments);
      out.turns.push(...g.turns);
      await new Promise((r) => setImmediate(r));
    }
    return out;
  })();
  return simSample;
}
const simMoments = async () => (await simGames()).moments;

describe("the moments in the sim's games (T-AC-5, AM-22)", () => {
  it('T-AC-5 (AM-22): a bot races in at least 40% of glints, never one whose detour breaks its errand (RULE-8)', { timeout: SAMPLE_TIMEOUT_MS }, async () => {
    const moments = await simMoments();
    const glints = sum(moments, 'glints');
    expect(glints, 'glints lit').toBeGreaterThanOrEqual(100);
    // RULE-8's example, from the mock's one-MULE bots, was 63%; the real AI plans its MULEs to fill the clock, so fewer
    // have time to spare. AM-22 rules the floor at 40%. The never-clause is the spare-time negative below the pub cases.
    expect(sum(moments, 'raced') / glints, 'share of glints a bot raced').toBeGreaterThanOrEqual(0.4);
  });

  it("T-AC-5 (AM-26): every AI colonist reaches the pub within the turn, except one a wolf's bite cost the pub, at most 1% of turns", { timeout: SAMPLE_TIMEOUT_MS }, async () => {
    const { turns } = await simGames();
    const missed = turns.filter((t) => t.pubAt === null);
    const excused = missed.filter((t) => t.biteCostPub);
    for (const t of excused) console.log(`T-AC-5 excused (AM-26): month ${t.month}, ${t.id}: a wolf's bite cost it the pub`);
    // Every other late turn is a miss, the AI's own choices included.
    const unexcused = missed.filter((t) => !t.biteCostPub).map((t) => `month ${t.month}, ${t.id}`);
    expect(unexcused, 'missed the pub with no excuse').toEqual([]);
    expect(excused.length / turns.length, `excused turns: ${excused.length} of ${turns.length}`).toBeLessThanOrEqual(0.01);
    expect(turns.every((t) => t.pubAt === null || t.pubAt <= DEVELOPMENT.fullSeconds)).toBe(true);
  });

  it('FM-hurry-margin: no AI colonist buys a MULE it then walks into the pub for want of time, but where a pack met it while it led the MULE', { timeout: SAMPLE_TIMEOUT_MS }, async () => {
    const { turns } = await simGames();
    // A MULE bought and not installed is paid for and lost: walked into the pub on its lead, or still on it at the clock.
    // The AI plans a MULE only with the margin its hurry for the pub keeps, so time never costs one; a pack met on the
    // way may. A MULE whose outfit or install the floor refused is lost for that, not for time: shown, not judged here.
    const lost = turns.filter((t) => t.bought > t.installs);
    const what = (t: DevTurn) => `month ${t.month}, ${t.id}: bought ${t.bought}, installed ${t.installs}`;
    for (const t of lost.filter((t) => t.muleStepFailed)) console.log(`FM-hurry-margin, not for time: ${what(t)}, an outfit or install refused on the floor`);
    const unexcused = lost.filter((t) => !t.packLeading && !t.muleStepFailed).map(what);
    expect(unexcused, `turns that bought a MULE and lost it for want of time (of ${turns.length})`).toEqual([]);
  });

  // trace-allow: a smoke check that the AI's legs by wolf land (RULE-4's AI line, botWolfLandShare) bring packs into
  // WOLVES.simMonthsWithPack of months. AM-27's binding check is `pnpm sim`'s report, 40 games AI-only on each of seeds
  // 1, 101 and 201 (its 'Months with an AI wolf encounter' line, MISS under that share): 40 games here would cost the
  // file about 30 s more than its budget.
  it('an AI colonist meets wolves in WOLVES.simMonthsWithPack of months of the sim sample: the legs by wolf land are walked', { timeout: SAMPLE_TIMEOUT_MS }, async () => {
    const moments = await simMoments();
    const met = moments.filter((m) => m.packs > 0).length;
    expect(met / moments.length, `months with an AI wolf encounter: ${met} of ${moments.length}`).toBeGreaterThanOrEqual(WOLVES.simMonthsWithPack);
  });
});

describe('the AI on a lake plot (AM-18)', () => {
  /** One tick of the walker's seat as the sim's runs it: its input, the step, the moments, then its press. */
  function walk(state: GameState, floor: DevFloor, cfg: FloorConfig, walker: FloorWalker, action: Parameters<FloorWalker['run']>[1]): { floor: DevFloor; run: StepRun } {
    const run = walker.run({ state, floor, cfg, secondsLeft: 40 }, action, 0);
    if (run.kind !== 'going') return { floor, run };
    const inputs = { ai0: run.input };
    const spent = doorPresses(floor, state, inputs, cfg);
    let next = settleMoments(state, stepFloor(floor, state, inputs, cfg.steer.tickMs, cfg));
    for (const id of pressOrder(next, run.input.act && !spent.has('ai0') ? ['ai0'] : [])) next = applyReach(state, next, id, 40, cfg).floor;
    return { floor: next, run };
  }

  it('AM-18: the AI walks to a lake plot\'s shore and analyses it from there', { timeout: 60_000 }, () => {
    steered(() => {
      // No moments: the walk alone.
      const base = simFloorConfig();
      const cfg: FloorConfig = { ...base, wolves: { ...base.wolves, on: false }, glint: { ...base.glint, on: false } };
      let tried = 0;
      for (let seed = 1; seed <= 12 && tried < 3; seed++) {
        const state = createGame({ seed, players: LEVELS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
        while (state.phase !== 'development') advancePhase(state);
        const lake = state.tiles.find((t) => t.terrain === 'lake' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const n = tileAt(state.tiles, state.width, t.x + dx!, t.y + dy!);
          return n !== undefined && n.owner === null && terrainShare(n.terrain, cfg) > 0;
        }));
        if (!lake) continue;
        tried++;
        let floor = buildFloor(state, cfg);
        const walker = new FloorWalker('ai0');
        const action = { type: 'analyse' as const, x: lake.x, y: lake.y };
        let run: StepRun = { kind: 'going', input: { x: 0, y: 0, act: false } };
        for (let i = 0; i < 2_000 && run.kind === 'going'; i++) ({ floor, run } = walk(state, floor, cfg, walker, action));
        expect(run, `seed ${seed}: lake ${lake.x}·${lake.y}`).toEqual({ kind: 'ok' });
        expect(hasAnalysed(state.players[0]!, state, lake)).toBe(true);
      }
      expect(tried, 'maps with a lake plot to try').toBeGreaterThan(0);
    });
  });
});

describe('the sim referees the floor as the server will (arcade C10)', () => {
  it('C10: a pub press pays exactly what game.ts pubPayoutFor says, and the button said so first', { timeout: 120_000 }, () => {
    steered(() => {
      // One press, by hand: a colonist standing in the pub with 30 s on the clock.
      const state = createGame({ seed: 4, players: LEVELS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
      while (state.phase !== 'development') advancePhase(state);
      const cfg = simFloorConfig();
      const pub = placePoint('pub', cfg.hall);
      const built = buildFloor(state, cfg);
      const floor = { ...built, colonists: built.colonists.map((c) => (c.id === 'ai1' ? { ...c, space: 'hall' as const, ...pub } : c)) };
      const secondsLeft = 30;
      const expected = pubPayoutFor(state, 'ai1', secondsLeft);
      expect(reachOf(floor, state, 'ai1', cfg, { secondsLeft })).toEqual({ kind: 'pub', enabled: true, payout: expected });
      const money = state.players[1]!.money;
      expect(applyReach(state, floor, 'ai1', secondsLeft, cfg).payout).toBe(expected);
      expect(state.players[1]!.money - money).toBe(expected);
    });
    // And in played turns: every pub paid what its button quoted, from the same pubPayoutFor. Every turn pressed one,
    // but where a wolf's bite cost it the pub (T-AC-5's one excuse, AM-26).
    const turns = steeredTurns(12).flat();
    for (const t of turns) expect(t.payout, `month ${t.month} ${t.id}`).toBe(t.quoted);
    expect(turns.filter((t) => t.quoted === null && !t.biteCostPub).map((t) => `month ${t.month}, ${t.id}`), 'no pub pressed, no excuse').toEqual([]);
    expect(turns.filter((t) => t.quoted !== null).length, 'pubs pressed').toBeGreaterThan(turns.length / 2);
  });

  it("AM-26: the bite is the excuse only where it cost the pub: the walk there fitted the clock unbitten, and bitten it does not", () => {
    steered(() => {
      const state = createGame({ seed: 4, players: LEVELS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
      while (state.phase !== 'development') advancePhase(state);
      const cfg = simFloorConfig();
      // A colonist bitten out on the map, at the far end of a plot row from the store.
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      const far = state.tiles.filter((t) => t.y === store.y && terrainShare(t.terrain, cfg) > 0).reduce((a, b) => (Math.abs(b.x - store.x) > Math.abs(a.x - store.x) ? b : a));
      const built = buildFloor(state, cfg);
      const c: FloorColonist = { ...built.colonists[1]!, space: 'map', x: far.x + 0.5, y: far.y + 0.5, lead: null, bitten: true };
      const unbitten = pubSeconds(state, cfg, { ...c, bitten: false });
      const bitten = pubSeconds(state, cfg, c);
      expect(bitten, 'the bite slows the walk to the pub').toBeGreaterThan(unbitten);
      const between = (unbitten + bitten) / 2; // literal-ok: halfway between the two walks
      expect(biteCostPub(state, cfg, c, between), 'in time unbitten, late bitten: the bite cost it the pub').toBe(true);
      expect(biteCostPub(state, cfg, c, bitten + 1), 'in time even bitten: no excuse needed').toBe(false);
      // Already late by its own choices before the bite: the bite cost it nothing, and the miss is its own.
      expect(biteCostPub(state, cfg, c, unbitten - 1), 'late even unbitten: not the bite').toBe(false);
    });
  });

  it("AM-19: a turn steps tick n only while n × tickMs is under the clock, so the bell comes first, as on the server", () => {
    const saved = DEV_STEER.month1WaitsForFirstMule;
    DEV_STEER.month1WaitsForFirstMule = false;
    try {
      steered(() => {
        const state = createGame({ seed: 4, players: LEVELS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
        while (state.phase !== 'development') advancePhase(state);
        // Seats that stand still and never press: nobody goes to the pub, so the turn runs to the bell.
        // They log no steps, race nothing.
        const idle = state.players.map((p) => ({ id: p.id, developSteer: () => ({ x: 0, y: 0, act: false }), developLog: () => [], developRacing: () => null, developScramblesRaced: () => 0 })) as unknown as AiSeat[];
        const phase = playFloorPhase(state, idle);
        let ticks = 0;
        for (let step = phase.next(); !step.done; step = phase.next()) ticks++;
        expect(ticks).toBe((DEVELOPMENT.fullSeconds * MS_PER_SECOND) / DEV_STEER.tickMs - 1);
      });
    } finally {
      DEV_STEER.month1WaitsForFirstMule = saved;
    }
  });

  it('AM-3: in month 1 the clock stands until every seat has its first MULE in, and runs at once without the rule', { timeout: 120_000 }, () => {
    const month1 = (waits: boolean) => {
      const saved = DEV_STEER.month1WaitsForFirstMule;
      DEV_STEER.month1WaitsForFirstMule = waits;
      try {
        return steered(() => playGame(1, seatsFor(1)));
      } finally {
        DEV_STEER.month1WaitsForFirstMule = saved;
      }
    };
    const waited = month1(true);
    // The seats got in by themselves (no host's stand-in), and the time they took stood off the clock.
    expect(waited.month1).toMatchObject({ continued: false });
    expect(waited.month1!.waited).toBeGreaterThan(0);
    const first = waited.turns.filter((t) => t.month === 1);
    expect(first.every((t) => t.installs > 0), JSON.stringify(first)).toBe(true);
    // The hands' `held` is the referee's own refusal: a seat already in never presses one, so none is refused.
    expect(waited.turns.map((t) => t.refused)).toEqual(waited.turns.map(() => 0));
    expect(month1(false).month1).toBeNull();
    // While ai3 stands idle, never in, the clock waits; the others, told nothing is held, press what it refuses: each
    // refused press is counted, per turn (§4).
    const original = AiSeat.prototype.developSteer;
    const spy = vi.spyOn(AiSeat.prototype, 'developSteer').mockImplementation(function (this: AiSeat, state, floor, secondsLeft, cfg) {
      return this.id === 'ai3' ? { x: 0, y: 0, act: false } : original.call(this, state, floor, secondsLeft, cfg, false);
    });
    try {
      const unheld = month1(true).turns.filter((t) => t.month === 1);
      expect(unheld.find((t) => t.id === 'ai3')!.refused).toBe(0);
      expect(unheld.reduce((n, t) => n + t.refused, 0), JSON.stringify(unheld)).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });
});

/** One leg of an AI's MULE on the floor: what the estimate said it would take, and what the floor took. */
interface LegTime {
  predicted: number;
  measured: number;
}

type Leg = 'corral' | 'outfitter' | 'plot' | 'pub' | 'mule';

/**
 * Every MULE the AI seats walked in `games` steered games from seed 1: per leg, the estimate (floor-time.ts muleLegs,
 * what developDecision's veto adds up, plus the counter's pause before the press) from where the colonist stood when
 * it set off, against the floor ticks it took. A leg runs from the tick the seat first sees its last press taken to the
 * tick it sees this one taken. MULEs whose walk ran through anything else (an analysis, a filter, month 1's hold, a
 * moment: wolves, a bite, a stun, a bolted MULE, pelts to sell, a glint race, a leg by wolf land) are left out: their
 * time is not the walk's.
 */
function muleWalks(games: number): Record<Leg, LegTime[]> {
  const out: Record<Leg, LegTime[]> = { corral: [], outfitter: [], plot: [], pub: [], mule: [] };
  type Trip = { at: number; c: FloorColonist; analysed: number; held: boolean; bought?: number; outfitted?: number; good?: Outfit; outfits?: Map<number, Outfit | null> };
  type PubWalk = { at: number; index: number; pause: number; c: FloorColonist; analysed: number; filters: number; held: boolean };
  type Seat = { month: number; carried: string | null; trip: Trip | null; pub: PubWalk | null; lastAct: number; last: number };
  const seats = new Map<string, Seat>();
  const own = (state: GameState, me: string) => state.tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.owner === me);
  const filters = (state: GameState, me: string) => own(state, me).filter(({ t }) => t.filter).length;
  const original = AiSeat.prototype.developSteer;
  const spy = vi.spyOn(AiSeat.prototype, 'developSteer').mockImplementation(function (this: AiSeat, state, floor, secondsLeft, cfg = simFloorConfig(), held = false) {
    const me = this.mind.me;
    const p = state.players.find((q) => q.id === me)!;
    const c = floor.colonists.find((x) => x.id === me)!;
    const pause = cfg.steer.botCounterPauseSeconds * this.mind.level.devPace;
    const seconds = (ticks: number) => (ticks * cfg.steer.tickMs) / MS_PER_SECOND;
    const t = floor.tick;
    let s = seats.get(me);
    if (!s || s.month !== state.month) {
      s = { month: state.month, carried: p.carriedMule, trip: null, pub: null, lastAct: -1, last: -1 };
      seats.set(me, s);
      if (p.carriedMule === null) s.trip = { at: t, c, analysed: p.analysed.length, held };
    }
    const was = s.carried;
    const now = p.carriedMule;
    const moment = c.encounter !== null || c.bitten || (c.stunnedUntilTick ?? -1) > t || !!c.bolt || c.pelts > 0 || this.developDetouring();
    if (held || moment) {
      if (s.trip) s.trip.held = true;
      if (s.pub) s.pub.held = true;
    }
    if (now !== was) {
      const trip = s.trip;
      s.pub = null;
      if (was === null && now === 'empty' && trip) trip.bought = t;
      else if (was === 'empty' && now !== null && now !== 'empty' && trip?.bought !== undefined) {
        trip.outfitted = t;
        trip.good = now;
        trip.outfits = new Map(own(state, me).map(({ t: tile, i }) => [i, tile.outfit]));
      } else if (was !== null && was !== 'empty' && now === null && trip?.outfitted !== undefined) {
        const changed = own(state, me).filter(({ t: tile, i }) => trip.outfits!.get(i) !== tile.outfit);
        if (changed.length === 1 && !trip.held && trip.analysed === p.analysed.length) {
          const index = changed[0]!.i;
          const legs = muleLegs(state, cfg, trip.c, index, trip.good!);
          const add = (leg: Leg, predicted: number, from: number, to: number) => out[leg].push({ predicted, measured: seconds(to - from) });
          add('corral', legs.corral + pause, trip.at, trip.bought!);
          add('outfitter', legs.outfitter + pause, trip.bought!, trip.outfitted);
          add('plot', legs.plot + pause, trip.outfitted, t);
          add('mule', legs.corral + legs.outfitter + legs.plot + 3 * pause, trip.at, t);
          s.pub = { at: t, index, pause, c, analysed: p.analysed.length, filters: filters(state, me), held: false };
        }
      }
      s.trip = now === null ? { at: t, c, analysed: p.analysed.length, held } : trip;
      s.carried = now;
    }
    const input = original.call(this, state, floor, secondsLeft, cfg, held);
    s.last = t;
    if (input.act) s.lastAct = t;
    return input;
  });
  // The estimate is of the errand's walk: this sample plays without the moments (no packs, glints or scrambles), whose
  // time is not the walk's. With the wolves off no leg goes by wolf land either (AM-22's legs are for the packs): the
  // share is left as configured, so a leg sent there for nothing shows as a walk off its estimate.
  const saved = { wolves: WOLVES.on, glint: GLINT.on, scramble: SCRAMBLE.on };
  WOLVES.on = false;
  GLINT.on = false;
  SCRAMBLE.on = false;
  try {
    steered(() => {
      for (let seed = 1; seed <= games; seed++) {
        playGame(seed, seatsFor(seed), {
          onPhase: (state) => {
            if (state.phase !== 'development') return;
            // The walk back to the pub: from the plot just installed on, when the next press was the pub's.
            const cfg = simFloorConfig();
            for (const [me, s] of seats) {
              const p = state.players.find((q) => q.id === me)!;
              const pub = s.pub;
              if (!pub || s.month !== state.month || !p.doneDeveloping || s.lastAct !== s.last || pub.held) continue;
              if (p.analysed.length !== pub.analysed || filters(state, me) !== pub.filters) continue;
              out.pub.push({ predicted: muleLegs(state, cfg, pub.c, pub.index, 'food').pub + pub.pause, measured: ((s.last + 1 - pub.at) * cfg.steer.tickMs) / MS_PER_SECOND });
            }
            seats.clear();
          },
        });
      }
    });
  } finally {
    spy.mockRestore();
    WOLVES.on = saved.wolves;
    GLINT.on = saved.glint;
    SCRAMBLE.on = saved.scramble;
  }
  return out;
}

/** Off by no more than this share of the floor's time. */
const TOLERANCE = 0.15;
/** The share of single walks that must be within TOLERANCE: a walk past a wolf or round a slower colonist may not. */
const WALKS_WITHIN = 0.8;

/** A leg's walks: the means, estimated and measured, and the share of single walks within TOLERANCE. */
function legSummary(leg: string, xs: LegTime[]) {
  const mean = (f: (x: LegTime) => number) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
  const within = xs.filter((x) => Math.abs(x.predicted / x.measured - 1) <= TOLERANCE).length / xs.length;
  return { leg, n: xs.length, predicted: mean((x) => x.predicted), measured: mean((x) => x.measured), within };
}

describe('the AI prices its walks as the floor plays them (arcade RULE-2, C9)', () => {
  it("INV-estimate: over seeded AI turns, a MULE's walk estimate is within 15% of the floor's time, leg by leg", { timeout: 300_000 }, () => {
    const legs = Object.entries(muleWalks(8)).map(([leg, xs]) => legSummary(leg, xs));
    const table = legs
      .map((m) => `${m.leg}: ${m.predicted.toFixed(2)} s estimated, ${m.measured.toFixed(2)} s on the floor, ${Math.round(m.within * 100)}% of ${m.n} walks within`)
      .join('\n');
    for (const m of legs) {
      const why = `${m.leg} is off:\n${table}`;
      expect(m.n, `${m.leg}: too few walks to judge`).toBeGreaterThanOrEqual(20);
      expect(Math.abs(m.predicted / m.measured - 1), why).toBeLessThanOrEqual(TOLERANCE);
      expect(m.within, why).toBeGreaterThanOrEqual(WALKS_WITHIN);
    }
  });
});
