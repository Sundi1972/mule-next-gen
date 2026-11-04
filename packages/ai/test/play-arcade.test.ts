import { describe, expect, it, vi } from 'vitest';
import {
  advancePhase,
  applyReach,
  buildFloor,
  createGame,
  DEV_STEER,
  DEVELOPMENT,
  MS_PER_SECOND,
  pubPayoutFor,
  reachOf,
  type AiLevelId,
  type FloorColonist,
  type GameState,
  type Outfit,
} from '@mule/engine';
import { muleLegs, placePoint } from '../src/floor-time.js';
import { playFloorPhase, simFloorConfig } from '../src/floor-turn.js';
import { ROTATION } from '../src/lineup.js';
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

describe('the AI walks the floor, and the sim plays it (arcade C9, C10)', () => {
  it('T-AC-5: in 20 seeded AI-only turns every AI colonist reaches the pub within 50 s', { timeout: 120_000 }, () => {
    const phases = steeredTurns(20);
    expect(phases).toHaveLength(20);
    for (const [i, seats] of phases.entries()) {
      expect(seats, `turn ${i}: one record a seat`).toHaveLength(LEVELS.length);
      for (const t of seats) {
        const why = `turn ${i}, month ${t.month}, ${t.id}`;
        expect(t.pubAt, `${why}: never reached the pub`).not.toBeNull();
        expect(t.pubAt!, `${why}: reached the pub after the clock`).toBeLessThanOrEqual(DEVELOPMENT.fullSeconds);
      }
    }
    // Reaching the pub is not the whole turn: the AI walked MULEs out and installed them on the way.
    expect(phases.flat().reduce((n, t) => n + t.installs, 0)).toBeGreaterThan(phases.length);
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
    // And in played turns: every pub paid what its button quoted, from the same pubPayoutFor.
    const turns = steeredTurns(12).flat();
    for (const t of turns) expect(t.payout, `month ${t.month} ${t.id}`).toBe(t.quoted);
    expect(turns.every((t) => t.quoted !== null)).toBe(true);
  });

  it("AM-19: a turn steps tick n only while n × tickMs is under the clock, so the bell comes first, as on the server", () => {
    const saved = DEV_STEER.month1WaitsForFirstMule;
    DEV_STEER.month1WaitsForFirstMule = false;
    try {
      steered(() => {
        const state = createGame({ seed: 4, players: LEVELS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
        while (state.phase !== 'development') advancePhase(state);
        // Seats that stand still and never press: nobody goes to the pub, so the turn runs to the bell.
        const idle = state.players.map((p) => ({ id: p.id, developSteer: () => ({ x: 0, y: 0, act: false }) })) as unknown as AiSeat[];
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
 * tick it sees this one taken. MULEs whose walk ran through anything else (an analysis, a filter, month 1's hold) are
 * left out: their time is not the walk's.
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
    if (held) {
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
